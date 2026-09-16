import {test,before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {testDatabase} from './postgres.js';
import {AuthService,DisabledOtpSender,type OtpSender} from '../src/auth.js';
import {buildApp} from '../src/app.js';
let ctx:Awaited<ReturnType<typeof testDatabase>>;
const secret='s'.repeat(32),origin='https://asaya.example.test';
class MemorySender implements OtpSender{
 messages:Parameters<OtpSender['sendOtp']>[0][]=[];
 async sendOtp(message:Parameters<OtpSender['sendOtp']>[0]){this.messages.push(message);}
}
before(async()=>{ctx=await testDatabase();});after(async()=>{await ctx?.stop();});
beforeEach(async()=>{await ctx.db.pool.query('TRUNCATE users,otp_challenges,rate_limits CASCADE');});

test('SMS cooldown, attempts, expiry and reuse are enforced on the server for normalized phone identities',async()=>{
 let now=new Date();const sender=new MemorySender();
 const auth=new AuthService(ctx.db,secret,sender,()=>now,{ttlSeconds:120,resendSeconds:90,maxAttempts:2},true);
 await assert.rejects(auth.request('email','buyer@example.test','ip'),/SMS_REQUIRED/);
 const ch=await auth.request('sms','8 (999) 123-45-67','ip');
 assert.equal(ch.expiresInSeconds,120);assert.equal(ch.retryAfterSeconds,90);
 assert.equal(sender.messages[0]!.destination,'+79991234567');
 await assert.rejects(auth.request('sms','9991234567','ip'),/OTP_COOLDOWN/);
 const code=sender.messages[0]!.code,wrong=code==='000000'?'111111':'000000';
 for(let i=0;i<2;i++)await assert.rejects(auth.verify(ch.challengeId,wrong,'ip'),/INVALID_OTP/);
 await assert.rejects(auth.verify(ch.challengeId,code,'ip'),/INVALID_OTP/);
 now=new Date(now.getTime()+91_000);
 const fresh=await auth.request('sms','79991234567','ip');
 await assert.rejects(auth.verify(ch.challengeId,code,'ip'),/INVALID_OTP/);
 const session=await auth.verify(fresh.challengeId,sender.messages[1]!.code,'ip');
 assert.equal((await auth.session(session.token)).id,session.user.id);
 await assert.rejects(auth.verify(fresh.challengeId,sender.messages[1]!.code,'ip'),/INVALID_OTP/);
 now=new Date(now.getTime()+91_000);
 const expired=await auth.request('sms','+79991234567','ip');now=new Date(now.getTime()+120_001);
 await assert.rejects(auth.verify(expired.challengeId,sender.messages[2]!.code,'ip'),/INVALID_OTP/);
 assert.equal((await ctx.db.pool.query('SELECT count(*)::int n FROM user_identities')).rows[0].n,1);
});

test('SMS mode rejects a pre-existing email challenge and never grants staff privileges',async()=>{
 const sender=new MemorySender(),foundation=new AuthService(ctx.db,secret,sender),sms=new AuthService(ctx.db,secret,sender,undefined,{},true);
 const email=await foundation.request('email','customer@example.test','a');
 await assert.rejects(sms.verify(email.challengeId,sender.messages[0]!.code,'b'),/INVALID_OTP/);
 const emailSession=await foundation.verify(email.challengeId,sender.messages[0]!.code,'b');
 await assert.rejects(sms.session(emailSession.token),/UNAUTHENTICATED/);
 const staff=randomUUID();await ctx.db.pool.query("INSERT INTO users(id,role) VALUES($1,'admin')",[staff]);
 await ctx.db.pool.query("INSERT INTO user_identities(channel,destination,user_id,verified_at) VALUES('sms','+79990000001',$1,now())",[staff]);
 const ch=await sms.request('sms','+79990000001','c');
 await assert.rejects(sms.verify(ch.challengeId,sender.messages[1]!.code,'c'),/INVALID_OTP/);
});

test('production SMS opens only customer auth: secure cookies, origin, CSRF, order ownership and YCP gates stay enforced',async()=>{
 const sender=new MemorySender();
 const options={db:ctx.db,deploymentMode:'ycp' as const,otpSecret:secret,staffSecret:'a'.repeat(32),otpSender:sender,customerSmsEnabled:true,origin,secureCookies:true,
  ycp:{token:'t'.repeat(32),settings:{accountId:'sms-fixture',environment:'production',publicOrigin:origin,priceUnit:null,vat:null,warehouseSource:'database',warehouses:[],button:{enabled:false}}}};
 await assert.rejects(buildApp({...options,otpSender:new DisabledOtpSender()}),/configured sender/);
 const app=await buildApp(options);
 try{
  assert.deepEqual((await app.inject('/api/store/v1/auth/methods')).json(),{yandex:false,orders:true,sms:true});
  const url='/api/store/v1/auth/otp/request',payload={channel:'sms',destination:'8 (999) 765-43-21'};
  assert.equal((await app.inject({method:'POST',url,headers:{origin:'https://other.test'},payload})).statusCode,403);
  assert.equal(sender.messages.length,0);
  assert.equal((await app.inject('/api/store/v1/orders')).statusCode,401);
  const started=await app.inject({method:'POST',url,headers:{origin},payload});assert.equal(started.statusCode,200,started.body);
  assert.ok(!started.body.includes(sender.messages[0]!.code));
  const signed=await app.inject({method:'POST',url:'/api/store/v1/auth/otp/verify',headers:{origin},payload:{challengeId:started.json().challengeId,code:sender.messages[0]!.code}});
  assert.equal(signed.statusCode,200,signed.body);
  const cookie=signed.cookies.find(c=>c.name==='__Host-asaya_session')!;
  assert.ok(cookie.httpOnly&&cookie.secure);assert.equal(cookie.path,'/');assert.equal(cookie.sameSite,'Strict');
  const cookies={[cookie.name]:cookie.value},csrf=signed.json().csrfToken;
  assert.equal((await app.inject({url:'/api/store/v1/auth/me',cookies})).statusCode,200);
  assert.deepEqual((await app.inject({url:'/api/store/v1/orders',cookies})).json().items,[]);
  assert.equal((await app.inject({url:'/api/store/v1/orders/'+randomUUID(),cookies})).statusCode,404);
  for(const url of ['/api/admin/v1/auth/me','/api/admin/v1/products','/api/admin/v1/site-pages/home','/api/v1/warehouses'])assert.equal((await app.inject({url,cookies})).statusCode,401);
  assert.equal((await app.inject({method:'PUT',url:'/api/admin/v1/site-pages/home',cookies,headers:{origin,'x-csrf-token':csrf},payload:{}})).statusCode,401);
  for(const url of ['/api/store/v1/checkouts','/api/store/v1/delivery/quotes','/api/store/v1/orders/'+randomUUID()+'/cancel'])assert.equal((await app.inject({method:'POST',url,cookies,headers:{origin,'x-csrf-token':csrf},payload:{}})).statusCode,503);
  const buy=await app.inject({method:'POST',url:'/api/store/v1/yandex/checkout-link',cookies,headers:{origin,'idempotency-key':randomUUID()},payload:{items:[{sku:'SMS-TEST',quantity:1}]}});
  assert.equal(buy.statusCode,503);assert.equal(buy.json().error,'YANDEX_CHECKOUT_UNAVAILABLE');
  assert.equal((await app.inject({method:'POST',url:'/api/store/v1/auth/logout',cookies,headers:{origin},payload:{}})).statusCode,403);
  assert.equal((await app.inject({method:'POST',url:'/api/store/v1/auth/logout',cookies,headers:{origin,'x-csrf-token':csrf},payload:{}})).statusCode,200);
  assert.equal((await app.inject({url:'/api/store/v1/auth/me',cookies})).statusCode,401);
 }finally{await app.close();}
});
