import {test,before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {testDatabase} from './postgres.js';
import {CustomerAccount,saveYcpCustomer} from '../src/customer-account.js';
import {AuthService,type OtpSender} from '../src/auth.js';
import {CommerceService} from '../src/commerce.js';
import {normalizeCustomerPhone} from '../src/customer-phone.js';
let ctx:Awaited<ReturnType<typeof testDatabase>>;
before(async()=>{ctx=await testDatabase();});after(async()=>{await ctx?.stop();});
beforeEach(async()=>{await ctx.db.pool.query('TRUNCATE users,products,otp_challenges,rate_limits CASCADE');});
async function guestOrder(phone:string,owner?:string){
 const guest=owner??randomUUID(),checkout=randomUUID(),id=randomUUID();
 if(!owner)await ctx.db.pool.query('INSERT INTO users(id,disabled) VALUES($1,true)',[guest]);
 await ctx.db.pool.query("INSERT INTO checkout_sessions(id,user_id,status,snapshot,expires_at) VALUES($1,$2,'placed','{}',now()+interval '1 hour')",[checkout,guest]);
 await ctx.db.pool.query(`INSERT INTO orders(id,public_number,checkout_id,user_id,status,payment_status,delivery_status,currency,subtotal_minor,delivery_minor,total_minor,customer_snapshot,delivery_snapshot,consent_snapshot)
 VALUES($1,'ASAYA-'||nextval('public_order_sequence'),$2,$3,'placed','paid','preparing','RUB',50000,0,50000,$4,'{}','{}')`,[id,checkout,guest,JSON.stringify({source:'ycp',phone,name:'Only owner sees this'})]);
 await ctx.db.pool.query("INSERT INTO ycp_sessions(account_id,environment,session_id,order_id,request_hash,placement_outcome) VALUES('account-test','test',$1::text,$1::uuid,'hash','placed')",[id]);
 return {id,guest,checkout};
}
test('SMS normalization in database matches login, including invalid values',async()=>{
 for(const value of ['+79991234567','8 (999) 123-45-67','9991234567','79991234567','+89991234567','phone79991234567','+7 (999) 123-45-67','123','', '  +79991234567  '])assert.equal((await ctx.db.pool.query('SELECT asaya_customer_phone($1) value',[value])).rows[0].value,normalizeCustomerPhone(value));
});

test('OTP registers a customer before any purchase, reuses normalized identity and associates a future order',async()=>{
 let now=new Date(),code='';const sender:OtpSender={sendOtp:async input=>{code=input.code;}};
 const auth=new AuthService(ctx.db,'s'.repeat(32),sender,()=>now,{},true),account=new CustomerAccount(ctx.db);
 const first=await auth.request('sms','8 (999) 123-45-67','ip');
 assert.equal((await ctx.db.pool.query('SELECT 1 FROM customer_profiles')).rowCount,0);
 const session=await auth.verify(first.challengeId,code,'ip');
 assert.deepEqual(await account.profile(session.user.id),{name:'',email:'',phone:'+79991234567'});
 assert.equal((await ctx.db.pool.query('SELECT 1 FROM orders')).rowCount,0);
 assert.equal((await auth.session(session.token)).id,session.user.id);
 await auth.logout(session.token);await assert.rejects(auth.session(session.token),/UNAUTHENTICATED/);
 now=new Date(+now+61000);
 const again=await auth.request('sms','9991234567','ip');
 const second=await auth.verify(again.challengeId,code,'ip');assert.equal(second.user.id,session.user.id);
 assert.equal((await ctx.db.pool.query('SELECT 1 FROM customer_profiles')).rowCount,1);
 assert.equal((await ctx.db.pool.query('SELECT 1 FROM users')).rowCount,1);
 const order=await guestOrder('+79991234567');
 await ctx.db.transaction(tx=>saveYcpCustomer(tx,order.id));
 const profile=(await ctx.db.pool.query('SELECT id,user_id FROM customer_profiles')).rows[0];
 assert.equal(profile.user_id,session.user.id);
 assert.equal((await ctx.db.pool.query('SELECT customer_id FROM orders WHERE id=$1',[order.id])).rows[0].customer_id,profile.id);
 await account.claim(session.user.id);
 assert.equal((await new CommerceService(ctx.db).order(session.user.id,order.id)).id,order.id);
});
test('only completed SMS verification claims past guest YCP orders, idempotently; other real accounts stay isolated',async()=>{
 const past=await guestOrder('8 (999) 123-45-67'),other=await guestOrder('+79990000000');
 const protectedUser=randomUUID();await ctx.db.pool.query('INSERT INTO users(id) VALUES($1)',[protectedUser]);
 await ctx.db.pool.query("INSERT INTO user_identities(channel,destination,user_id,verified_at) VALUES('email','owner@example.test',$1,now())",[protectedUser]);
 const protectedOrder=await guestOrder('+79991234567',protectedUser);
 let code='';const sender:OtpSender={sendOtp:async input=>{code=input.code;}};
 const auth=new AuthService(ctx.db,'s'.repeat(32),sender,undefined,{},true),account=new CustomerAccount(ctx.db),commerce=new CommerceService(ctx.db);
 const challenge=await auth.request('sms','+79991234567','test');
 assert.equal((await ctx.db.pool.query('SELECT user_id FROM orders WHERE id=$1',[past.id])).rows[0].user_id,past.guest);
 const session=await auth.verify(challenge.challengeId,code,'test');
 assert.equal((await commerce.orders(session.user.id)).items.length,1);
 await Promise.all([account.claim(session.user.id),account.claim(session.user.id)]);
 assert.equal((await ctx.db.pool.query('SELECT count(*)::int n FROM customer_order_claims')).rows[0].n,1);
 await assert.rejects(commerce.order(session.user.id,other.id),/ORDER_NOT_FOUND/);
 await assert.rejects(commerce.order(session.user.id,protectedOrder.id),/ORDER_NOT_FOUND/);
 const later=await guestOrder('9991234567');await account.claim(session.user.id);
 assert.equal((await commerce.order(session.user.id,later.id)).id,later.id);
 assert.equal((await ctx.db.pool.query('SELECT user_id FROM checkout_sessions WHERE id=$1',[later.checkout])).rows[0].user_id,session.user.id);
 await account.save(session.user.id,{name:'Имя',email:'owner@example.test'});
 assert.equal((await account.profile(session.user.id)).phone,'+79991234567');
 await assert.rejects(account.save(session.user.id,{name:'',email:'',phone:'+79990000000'}));
 await account.claim(session.user.id);assert.equal((await commerce.orders(session.user.id)).items.length,2);
 assert.equal((await ctx.db.pool.query("SELECT count(*)::int n FROM user_identities WHERE user_id=$1 AND channel='email'",[session.user.id])).rows[0].n,0);
});
