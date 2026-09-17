import {before,after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {testDatabase} from './postgres.js';
import {AdminPrivacy} from '../src/admin-privacy.js';
import {config} from '../src/config.js';
import {purgeUnpaidContacts} from '../src/order-retention.js';
import {buildApp} from '../src/app.js';
import {DisabledOtpSender} from '../src/auth.js';
import {StaffAuth,totp,decodeBase32} from '../src/staff-auth.js';
let ctx:Awaited<ReturnType<typeof testDatabase>>;
before(async()=>{ctx=await testDatabase();});after(async()=>{await ctx?.stop();});
beforeEach(async()=>{await ctx.db.pool.query('TRUNCATE users,products,otp_challenges,rate_limits CASCADE');});
async function fixture(){
 const actor=randomUUID(),buyer=randomUUID(),id=randomUUID(),checkout=randomUUID(),profile=randomUUID();
 await ctx.db.pool.query("INSERT INTO users(id,role) VALUES($1,'admin'),($2,'customer')",[actor,buyer]);
 await ctx.db.pool.query("INSERT INTO customer_profiles(id,phone,user_id,name,email) VALUES($1,'+79991234567',$2,'Private Name','private@example.test')",[profile,buyer]);
 await ctx.db.pool.query("INSERT INTO checkout_sessions(id,user_id,status,snapshot,expires_at) VALUES($1,$2,'cancelled',$3,now())",[checkout,buyer,{customer:{phone:'+79991234567'},delivery:{address:'Private address'},items:[{sku:'A',quantity:1}]}]);
 await ctx.db.pool.query(`INSERT INTO orders(id,public_number,checkout_id,user_id,status,payment_status,delivery_status,currency,subtotal_minor,delivery_minor,total_minor,customer_snapshot,delivery_snapshot,consent_snapshot,customer_id)
 VALUES($1,'ASAYA-TEST',$2,$3,'cancelled','cancelled','not_created','RUB',50000,0,50000,$4,$5,'{"accepted":true}',$6)`,[id,checkout,buyer,{source:'ycp',phone:'+79991234567',name:'Private Name'},{source:'ycp',address:{address:'Private address'}},profile]);
 await ctx.db.pool.query("INSERT INTO order_status_history(id,order_id,kind,status,source) VALUES($1,$2,'order','cancelled','ycp')",[randomUUID(),id]);
 const api=new AdminPrivacy(ctx.db);
 const preview=(scope='order_contacts')=>api.preview(actor,id,{scope});
 const input=(p:Awaited<ReturnType<typeof preview>>)=>({scope:p.scope,revision:p.revision,confirmation:p.confirmation,confirmed:true,permittedContactsConfirmed:true,reason:'customer_request'});
 return {actor,buyer,id,checkout,profile,api,preview,input};
}
test('manual order contacts require exact current preview and preserve financial/order snapshots; audit contains no contacts',async()=>{
 const f=await fixture(),p=await f.preview();assert.equal(p.blocked,null);assert.equal(p.orders.length,1);
 await assert.rejects(f.api.apply(f.actor,f.id,{...f.input(p),confirmed:false}));
 await assert.rejects(f.api.apply(f.actor,f.id,{...f.input(p),confirmation:'wrong'}),/CONFIRMATION_MISMATCH/);
 await f.api.apply(f.actor,f.id,f.input(p));
 const o=(await ctx.db.pool.query('SELECT * FROM orders WHERE id=$1',[f.id])).rows[0];assert.equal(o.customer_snapshot.redacted,true);assert.equal(o.delivery_snapshot.redacted,true);assert.equal(o.total_minor,'50000');assert.deepEqual(o.consent_snapshot,{accepted:true});assert.equal(o.customer_id,f.profile);
 const c=(await ctx.db.pool.query('SELECT snapshot FROM checkout_sessions WHERE id=$1',[f.checkout])).rows[0];assert.deepEqual(c.snapshot,{items:[{sku:'A',quantity:1}],delivery:{}});
 const a=(await ctx.db.pool.query("SELECT actor_id,detail FROM audit_log WHERE action='privacy.manual'")).rows;assert.equal(a.length,2);assert.equal(a[1].actor_id,f.actor);assert.ok(!JSON.stringify(a).includes('Private'));assert.ok(!JSON.stringify(a).includes('79991234567'));
 assert.equal((await f.preview()).alreadyCleared,true);
 await assert.rejects(f.api.apply(f.actor,f.id,f.input(p)),/PRIVACY_PREVIEW_STALE/);
});
test('legal hold, changed state, successful payment and customer roles prevent contact erasure',async()=>{
 const f=await fixture(),p=await f.preview();
 await assert.rejects(f.api.preview(f.buyer,f.id,{scope:'order_contacts'}),/FORBIDDEN/);
 await assert.rejects(f.api.apply(f.buyer,f.id,f.input(p)),/FORBIDDEN/);
 await ctx.db.pool.query('UPDATE orders SET legal_hold=true WHERE id=$1',[f.id]);await assert.rejects(f.api.apply(f.actor,f.id,f.input(p)),/LEGAL_HOLD/);
 await ctx.db.pool.query("UPDATE orders SET legal_hold=false,payment_status='paid' WHERE id=$1",[f.id]);await assert.rejects(f.api.apply(f.actor,f.id,f.input(p)),/ORDER_NOT_DEFINITIVELY_CANCELLED/);
 await ctx.db.pool.query("UPDATE orders SET payment_status='cancelled',customer_snapshot=customer_snapshot||'{\"name\":\"Changed\"}' WHERE id=$1",[f.id]);await assert.rejects(f.api.apply(f.actor,f.id,f.input(p)),/PRIVACY_PREVIEW_STALE/);
 assert.equal((await ctx.db.pool.query('SELECT customer_snapshot FROM orders')).rows[0].customer_snapshot.phone,'+79991234567');
});
test('profile operation clears only optional fields and preserves verified identity and historical contacts',async()=>{
 const f=await fixture();await ctx.db.pool.query("INSERT INTO user_identities(channel,destination,user_id,verified_at) VALUES('sms','+79991234567',$1,now())",[f.buyer]);
 const p=await f.preview('profile_optional');await f.api.apply(f.actor,f.id,f.input(p));
 const profile=(await ctx.db.pool.query('SELECT * FROM customer_profiles')).rows[0];assert.equal(profile.name,'');assert.equal(profile.email,'');assert.equal(profile.phone,'+79991234567');
 assert.equal((await ctx.db.pool.query('SELECT * FROM user_identities')).rowCount,1);assert.equal((await ctx.db.pool.query('SELECT customer_snapshot FROM orders')).rows[0].customer_snapshot.name,'Private Name');
});
test('concurrent confirmed requests clear once and a changed preview cannot repeat the mutation',async()=>{
 const f=await fixture(),p=await f.preview();
 const results=await Promise.allSettled([f.api.apply(f.actor,f.id,f.input(p)),f.api.apply(f.actor,f.id,f.input(p))]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.equal((await ctx.db.pool.query("SELECT 1 FROM audit_log WHERE action='privacy.manual' AND detail->>'result'='cleared'")).rowCount,1);
 const retry=await f.preview();await f.api.apply(f.actor,f.id,f.input(retry));
 assert.equal((await ctx.db.pool.query("SELECT 1 FROM audit_log WHERE action='privacy.manual' AND detail->>'result'='cleared'")).rowCount,1);
});
test('scheduled retention cannot be enabled and old entry point cannot purge',async()=>{
 const f=await fixture();assert.throws(()=>config({DATABASE_URL:'postgresql://local/test',OTP_SECRET:'x'.repeat(32),UNPAID_RETENTION_ENABLED:'true'}),/Automatic customer\/order retention is disabled/);
 await assert.rejects(purgeUnpaidContacts(ctx.db,{accountId:'test',environment:'test'}),/AUTOMATIC_RETENTION_DISABLED/);assert.equal((await f.preview()).alreadyCleared,false);
});
test('financial/provider records block erasure even when local payment says cancelled; shipping amounts survive permitted contact removal',async()=>{
 const f=await fixture();
 await ctx.db.pool.query("INSERT INTO payments(id,order_id,provider,account_id,environment,external_id,status,amount_minor,currency) VALUES($1,$2,'test','account','test','payment','cancelled',50000,'RUB')",[randomUUID(),f.id]);
 assert.equal((await f.preview()).blocked,'RECORDS_REQUIRE_RETENTION_REVIEW');
 await ctx.db.pool.query('DELETE FROM payments WHERE order_id=$1',[f.id]);
 await ctx.db.pool.query("UPDATE orders SET delivery_snapshot=delivery_snapshot||$2::jsonb WHERE id=$1",[f.id,JSON.stringify({ycp:{price:100,service_type:'cdek',address:{apartment:'Private'}}})]);
 await ctx.db.pool.query("UPDATE checkout_sessions SET snapshot=jsonb_set(snapshot,'{delivery}', $2) WHERE id=$1",[f.checkout,{price:100,service_type:'cdek',address:{apartment:'Private'}}]);
 await f.api.apply(f.actor,f.id,f.input(await f.preview()));
 const o=(await ctx.db.pool.query('SELECT delivery_snapshot FROM orders WHERE id=$1',[f.id])).rows[0];assert.deepEqual(o.delivery_snapshot.ycp,{price:100,service_type:'cdek'});
 const c=(await ctx.db.pool.query('SELECT snapshot FROM checkout_sessions WHERE id=$1',[f.checkout])).rows[0];assert.deepEqual(c.snapshot.delivery,{price:100,service_type:'cdek'});
});
for(const mode of ['catalog','ycp'] as const)test('HTTP manual privacy requires staff session, same origin, CSRF and no-store in '+mode,async()=>{
 const f=await fixture(),secret='s'.repeat(40),password='A-long-local-test-password-123',key='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',staff=new StaffAuth(ctx.db,secret);
 await staff.provision('privacy@example.test',password,key);const login=await staff.login({email:'privacy@example.test',password,code:totp(decodeBase32(key),Math.floor(Date.now()/30000))},'test');
 const app=await buildApp({db:ctx.db,otpSecret:secret,staffSecret:secret,otpSender:new DisabledOtpSender(),origin:'https://asaya.test',secureCookies:true,deploymentMode:mode,...(mode==='ycp'?{ycp:{token:'t'.repeat(32),settings:{accountId:'privacy-fixture',environment:'production',publicOrigin:'https://asaya.test',priceUnit:null,vat:null,warehouseSource:'database',warehouses:[],button:{enabled:false}}}}:{})});
 try{
  const url=`/api/admin/v1/orders/${f.id}/privacy`,cookie=`__Host-asaya_staff=${login.token}`;
  assert.equal((await app.inject({url:url+'?scope=order_contacts'})).statusCode,401);
  const read=await app.inject({url:url+'?scope=order_contacts',headers:{cookie}});assert.equal(read.statusCode,200);assert.equal(read.headers['cache-control'],'no-store');const payload=f.input(read.json());
  assert.equal((await app.inject({url,method:'POST',headers:{cookie,origin:'https://asaya.test'},payload})).statusCode,403);
  assert.equal((await app.inject({url,method:'POST',headers:{cookie,origin:'https://evil.test','x-csrf-token':login.csrfToken},payload})).statusCode,403);
  assert.equal((await app.inject({url,method:'POST',headers:{cookie,origin:'https://asaya.test','x-csrf-token':login.csrfToken},payload})).statusCode,200);
 }finally{await app.close();}
});
