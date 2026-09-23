import {SMS_CONSENT_VERSION} from '../src/sms-consent-policy.js';
const smsConsent={accepted:true as const,version:SMS_CONSENT_VERSION} as const;
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
 const ch=await auth.request('sms','8 (999) 123-45-67','ip',smsConsent);
 assert.equal(ch.expiresInSeconds,120);assert.equal(ch.retryAfterSeconds,90);
 assert.equal(sender.messages[0]!.destination,'+79991234567');
 await assert.rejects(auth.request('sms','9991234567','ip',smsConsent),/OTP_COOLDOWN/);
 const code=sender.messages[0]!.code,wrong=code==='000000'?'111111':'000000';
 for(let i=0;i<2;i++)await assert.rejects(auth.verify(ch.challengeId,wrong,'ip'),/INVALID_OTP/);
 await assert.rejects(auth.verify(ch.challengeId,code,'ip'),/INVALID_OTP/);
 now=new Date(now.getTime()+91_000);
 const fresh=await auth.request('sms','79991234567','ip',smsConsent);
 await assert.rejects(auth.verify(ch.challengeId,code,'ip'),/INVALID_OTP/);
 const session=await auth.verify(fresh.challengeId,sender.messages[1]!.code,'ip');
 assert.equal((await auth.session(session.token)).id,session.user.id);
 await assert.rejects(auth.verify(fresh.challengeId,sender.messages[1]!.code,'ip'),/INVALID_OTP/);
 now=new Date(now.getTime()+91_000);
 const expired=await auth.request('sms','+79991234567','ip',smsConsent);now=new Date(now.getTime()+120_001);
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
 const ch=await sms.request('sms','+79990000001','c',smsConsent);
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
  const url='/api/store/v1/auth/otp/request',payload={consent:smsConsent,channel:'sms',destination:'8 (999) 765-43-21'};
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

test('five wrong guesses consume the challenge; concurrent verification creates only one session and stores no plaintext code',async()=>{
 const sender=new MemorySender(),auth=new AuthService(ctx.db,secret,sender,undefined,{},true);
 const a=await auth.request('sms','+79991111111','one',smsConsent);const code=sender.messages[0]!.code;
 const saved=(await ctx.db.pool.query('SELECT code_mac FROM otp_challenges WHERE id=$1',[a.challengeId])).rows[0];
 assert.match(saved.code_mac,/^[a-f0-9]{64}$/);assert.notEqual(saved.code_mac,code);
 for(let i=0;i<5;i++)await assert.rejects(auth.verify(a.challengeId,code==='000000'?'111111':'000000','one'),/INVALID_OTP/);
 assert.ok((await ctx.db.pool.query('SELECT consumed_at FROM otp_challenges WHERE id=$1',[a.challengeId])).rows[0].consumed_at);
 await assert.rejects(auth.verify(a.challengeId,code,'one'),/INVALID_OTP/);
 const b=await auth.request('sms','+79992222222','two',smsConsent);
 const results=await Promise.allSettled([auth.verify(b.challengeId,sender.messages[1]!.code,'two'),auth.verify(b.challengeId,sender.messages[1]!.code,'two')]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.equal((await ctx.db.pool.query('SELECT 1 FROM auth_sessions')).rowCount,1);
});

test('ambiguous SMS send is not retried, retains cooldown and invalidates the potentially delivered code',async()=>{
 let calls=0,code='';const auth=new AuthService(ctx.db,secret,{sendOtp:async input=>{calls++;code=input.code;throw new Error('provider timeout after accepting');}},undefined,{},true);
 await assert.rejects(auth.request('sms','+79991111111','ip',smsConsent),/OTP_DELIVERY_UNAVAILABLE/);
 await assert.rejects(auth.request('sms','+79991111111','other-ip',smsConsent),/OTP_COOLDOWN/);assert.equal(calls,1);
 const row=(await ctx.db.pool.query('SELECT * FROM otp_challenges')).rows[0];assert.equal(row.delivery_status,'failed');assert.ok(row.consumed_at);
 await assert.rejects(auth.verify(row.id,code,'ip'),/INVALID_OTP/);
 assert.equal((await ctx.db.pool.query('SELECT 1 FROM auth_sessions')).rowCount,0);
});

test('phone and IP limits cannot be evaded by normalization, another phone, or concurrent requests',async()=>{
 let now=new Date();const sender=new MemorySender(),auth=new AuthService(ctx.db,secret,sender,()=>now,{sendPerPhonePerHour:1,sendPerIpPerHour:2},true);
 await auth.request('sms','+79991111111','ip',smsConsent);now=new Date(+now+61000);
 await assert.rejects(auth.request('sms','8 (999) 111-11-11','another-ip',smsConsent),/RATE_LIMITED/);
 const parallel=await Promise.allSettled([auth.request('sms','+79992222222','ip',smsConsent),auth.request('sms','+79993333333','ip',smsConsent)]);
 assert.equal(parallel.filter(r=>r.status==='fulfilled').length,1);assert.equal(sender.messages.length,2);
 assert.ok((await ctx.db.pool.query('SELECT bucket_key FROM rate_limits')).rows.every(r=>!r.bucket_key.includes('7999')));
});

test('request-code shape is identical for a known profile and a new phone and does not authorize either',async()=>{
 const user=randomUUID();await ctx.db.pool.query('INSERT INTO users(id) VALUES($1)',[user]);
 await ctx.db.pool.query("INSERT INTO user_identities(channel,destination,user_id,verified_at) VALUES('sms','+79991111111',$1,now())",[user]);
 const sender=new MemorySender(),auth=new AuthService(ctx.db,secret,sender,undefined,{},true);
 const old=await auth.request('sms','+79991111111','ip',smsConsent),fresh=await auth.request('sms','+79992222222','ip',smsConsent);
 assert.deepEqual(Object.keys(old).sort(),Object.keys(fresh).sort());
 assert.deepEqual({...old,challengeId:''},{...fresh,challengeId:''});
 assert.equal((await ctx.db.pool.query('SELECT 1 FROM auth_sessions')).rowCount,0);
 assert.equal((await ctx.db.pool.query('SELECT 1 FROM users WHERE NOT disabled')).rowCount,1);
});

test('daily SMS budget survives hourly resets, phone aliases and IP changes; blocked attempts do not send',async()=>{
 let now=new Date();const start=+now,sender=new MemorySender(),auth=new AuthService(ctx.db,secret,sender,()=>now,{},true);
 for(let n=0;n<10;n++){
  now=new Date(start+Math.floor(n/5)*3600_000+(n%5)*61_000);
  await auth.request('sms',n%2?'8 (999) 111-11-11':'+79991111111','ip-'+n,smsConsent);
  if(n===4){now=new Date(+now+61_000);await assert.rejects(auth.request('sms','9991111111','hour-overflow',smsConsent),/RATE_LIMITED/);}
 }
 now=new Date(start+2*3600_000);
 const attempts=await Promise.allSettled([auth.request('sms','9991111111','new-ip',smsConsent),auth.request('sms','79991111111','another-ip',smsConsent)]);
 assert.ok(attempts.every(r=>r.status==='rejected'&&/RATE_LIMITED/.test(String(r.reason))));
 assert.equal(sender.messages.length,10);
 now=new Date(start+86400_000);await auth.request('sms','+79991111111','tomorrow',smsConsent);
 assert.equal(sender.messages.length,11);
});
