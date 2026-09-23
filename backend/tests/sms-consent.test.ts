import {test,before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {testDatabase} from './postgres.js';
import {AuthService,type OtpSender} from '../src/auth.js';
import {SmsConsent} from '../src/sms-consent.js';
import {SMS_CONSENT_VERSION} from '../src/sms-consent-policy.js';
import {buildApp} from '../src/app.js';
let ctx:Awaited<ReturnType<typeof testDatabase>>;
before(async()=>{ctx=await testDatabase();});after(async()=>{await ctx?.stop();});
beforeEach(async()=>{await ctx.db.pool.query('TRUNCATE users,otp_challenges,rate_limits CASCADE');});
const consent={accepted:true as const,version:SMS_CONSENT_VERSION} as const;
test('consent gates SMS, preserves proof, repeats idempotently, records verification and requires fresh consent after revoke',async()=>{
 let now=new Date();const messages:Parameters<OtpSender['sendOtp']>[0][]=[];
 const auth=new AuthService(ctx.db,'s'.repeat(32),{sendOtp:async m=>{messages.push(m);}},()=>now);
 const service=new SmsConsent(ctx.db),phone='+79991234567';
 assert.equal((await service.status(phone)).active,false);
 await assert.rejects(auth.request('sms',phone,'ip'),/SMS_CONSENT_REQUIRED/);assert.equal(messages.length,0);
 const ch=await auth.request('sms',phone,'ip',consent);
 let rows=(await service.history(phone)).items;assert.equal(rows.length,1);assert.equal(rows[0].verified_at,null);
 assert.equal(rows[0].source,'customer_sms_login');assert.equal(rows[0].consent_type,'sms_auth_service');assert.ok(rows[0].text_snapshot.paragraphs.length);
 const session=await auth.verify(ch.challengeId,messages[0]!.code,'ip');rows=(await service.history(phone)).items;
 assert.equal(rows[0].customer_id,session.user.id);assert.ok(rows[0].verified_at);
 now=new Date(+now+61000);await auth.request('sms',phone,'ip');assert.equal((await service.history(phone)).items.length,1);
 const admin=randomUUID();await ctx.db.pool.query("INSERT INTO users(id,role) VALUES($1,'admin')",[admin]);
 await service.revoke(phone,admin,'Verified support request');assert.equal((await service.status(phone)).active,false);
 now=new Date(+now+61000);await assert.rejects(auth.request('sms',phone,'ip'),/SMS_CONSENT_REQUIRED/);assert.equal(messages.length,2);
 await auth.request('sms',phone,'ip',consent);rows=(await service.history(phone)).items;
 assert.equal(rows.length,2);assert.equal(rows.filter(r=>r.revoked_at).length,1);assert.equal(messages.length,3);
 assert.equal((await service.status('+79990000000')).active,false);
});
test('old text version cannot authorize SMS; concurrent submits create one consent and one SMS',async()=>{
 let sends=0;const auth=new AuthService(ctx.db,'s'.repeat(32),{sendOtp:async()=>{sends++;}}),phone='+79991234567';
 await ctx.db.pool.query(`INSERT INTO sms_consents(id,phone,text_version,document_url,text_snapshot,granted_at) VALUES($1,$2,'old','/old','{}',now())`,[randomUUID(),phone]);
 await assert.rejects(auth.request('sms',phone,'ip'),/SMS_CONSENT_REQUIRED/);
 const results=await Promise.allSettled([auth.request('sms',phone,'ip',consent),auth.request('sms',phone,'ip',consent)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(sends,1);
 assert.equal((await ctx.db.pool.query('SELECT 1 FROM sms_consents WHERE text_version=$1',[SMS_CONSENT_VERSION])).rowCount,1);
});
test('HTTP consent status is origin checked, private/no-store; OTP refuses absent/false/old consent before provider',async()=>{
 let sends=0;const origin='https://asaya.example.test';
 const app=await buildApp({db:ctx.db,otpSecret:'s'.repeat(32),staffSecret:'a'.repeat(32),otpSender:{sendOtp:async()=>{sends++;}},customerSmsEnabled:true,deploymentMode:'catalog',origin,secureCookies:true});
 try{
  const payload={channel:'sms',destination:'+79991234567'},url='/api/store/v1/auth/otp/request';
  assert.equal((await app.inject({method:'POST',url,headers:{origin},payload})).json().error,'SMS_CONSENT_REQUIRED');
  for(const bad of [{accepted:false,version:SMS_CONSENT_VERSION},{accepted:true,version:'old'}])assert.equal((await app.inject({method:'POST',url,headers:{origin},payload:{...payload,consent:bad}})).statusCode,400);
  const statusUrl='/api/store/v1/auth/sms-consent/status';
  assert.equal((await app.inject({method:'POST',url:statusUrl,payload:{destination:payload.destination}})).statusCode,403);
  const status=await app.inject({method:'POST',url:statusUrl,headers:{origin},payload:{destination:payload.destination}});
  assert.deepEqual(status.json(),{active:false,version:SMS_CONSENT_VERSION});assert.equal(status.headers['cache-control'],'no-store');
  assert.equal((await app.inject('/api/admin/v1/sms-consents?phone=%2B79991234567')).statusCode,401);assert.equal(sends,0);
  assert.equal((await app.inject({method:'POST',url,headers:{origin},payload:{...payload,consent}})).statusCode,200);assert.equal(sends,1);
 }finally{await app.close();}
});
