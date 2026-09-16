import {before,after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {testDatabase} from './postgres.js';
import {CustomerYandexAuth,YandexIdProvider,yandexCallbackPath,type YandexIdentityProvider} from '../src/yandex-id.js';
import {AuthService,DisabledOtpSender} from '../src/auth.js';
import {buildApp} from '../src/app.js';
import {hash} from '../src/core.js';

let ctx:Awaited<ReturnType<typeof testDatabase>>,now:Date;
const clientId='a'.repeat(32),origin='https://asaya.example.test',secret='o'.repeat(32);
const provider:YandexIdentityProvider={authorize:(state,verifier)=>new YandexIdProvider(clientId,origin).authorize(state,verifier),identify:async code=>({subject:code})};
before(async()=>{ctx=await testDatabase();});after(async()=>{await ctx?.stop();});
beforeEach(async()=>{await ctx.db.pool.query('TRUNCATE users,customer_oauth_states,rate_limits CASCADE');now=new Date();});
const service=(id=clientId,p=provider)=>new CustomerYandexAuth(ctx.db,secret,id,p,()=>now);
const flow=async(auth=service())=>{const started=await auth.start('127.0.0.1');return {...started,state:new URL(started.url).searchParams.get('state')!};};
const sessionAuth=()=>new AuthService(ctx.db,secret,new DisabledOtpSender(),()=>now);

test('Yandex customer identity is stable under concurrent login and never merges by email or grants staff rights',async()=>{
 const old=randomUUID();await ctx.db.pool.query('INSERT INTO users(id,disabled) VALUES($1,true)',[old]);
 await ctx.db.pool.query("INSERT INTO user_identities(channel,destination,user_id,verified_at) VALUES('email','buyer@example.test',$1,now())",[old]);
 const auth=service(),flows=await Promise.all([flow(auth),flow(auth),flow(auth)]);
 const sessions=await Promise.all(flows.map(f=>auth.finish({state:f.state,code:'123'},f.browser)));
 assert.equal(new Set(sessions.map(s=>s.user.id)).size,1);assert.notEqual(sessions[0]!.user.id,old);
 assert.equal((await ctx.db.pool.query('SELECT count(*)::int n FROM customer_oauth_identities')).rows[0].n,1);
 assert.equal((await ctx.db.pool.query('SELECT user_id FROM user_identities')).rows[0].user_id,old);
 for(const s of sessions){assert.equal(s.user.role,'customer');assert.equal((await sessionAuth().session(s.token)).id,s.user.id);}
 const next=await flow(auth),rotated=await auth.finish({state:next.state,code:'123'},next.browser,sessions[0]!.token);
 assert.equal(rotated.user.id,sessions[0]!.user.id);await assert.rejects(sessionAuth().session(sessions[0]!.token),/UNAUTHENTICATED/);
 const another=await flow(auth);assert.notEqual((await auth.finish({state:another.state,code:'456'},another.browser)).user.id,rotated.user.id);
 const otherApp=service('b'.repeat(32)),otherFlow=await flow(otherApp);
 assert.notEqual((await otherApp.finish({state:otherFlow.state,code:'123'},otherFlow.browser)).user.id,rotated.user.id);
});

test('Yandex login binds one-use state to the browser, expires it and does not store credentials',async()=>{
 let calls=0;const auth=service(clientId,{...provider,identify:async code=>{calls++;return {subject:code};}}),f=await flow(auth);
 const stored=(await ctx.db.pool.query('SELECT * FROM customer_oauth_states')).rows[0];
 assert.equal(stored.state_hash,hash(f.state));assert.equal(stored.browser_hash,hash(f.browser));
 assert.ok(!JSON.stringify(stored).includes(f.state));assert.ok(!JSON.stringify(stored).includes(f.browser));
 await assert.rejects(auth.finish({state:f.state,code:'123'},'x'.repeat(43)),/YANDEX_LOGIN_INVALID/);assert.equal(calls,0);
 const replies=await Promise.allSettled([auth.finish({state:f.state,code:'123'},f.browser),auth.finish({state:f.state,code:'123'},f.browser)]);
 assert.equal(replies.filter(r=>r.status==='fulfilled').length,1);assert.equal(calls,1);
 const expired=await flow(auth);now=new Date(now.getTime()+600000);
 await assert.rejects(auth.finish({state:expired.state,code:'123'},expired.browser),/YANDEX_LOGIN_INVALID/);assert.equal(calls,1);
 const cancelled=await flow(auth);await assert.rejects(auth.finish({state:cancelled.state,error:'access_denied'},cancelled.browser),/YANDEX_LOGIN_CANCELLED/);
 await assert.rejects(auth.finish({state:cancelled.state,code:'123'},cancelled.browser),/YANDEX_LOGIN_INVALID/);
});

test('Yandex login rejects disabled and staff identities and limits repeated starts',async()=>{
 const auth=service();
 for(const role of ['admin','manager','customer']){
  const id=randomUUID();await ctx.db.pool.query('INSERT INTO users(id,role,disabled) VALUES($1,$2,$3)',[id,role,role==='customer']);
  await ctx.db.pool.query("INSERT INTO customer_oauth_identities(provider,client_id,subject,user_id) VALUES('yandex',$1,$2,$3)",[clientId,role,id]);
  const f=await flow(auth);await assert.rejects(auth.finish({state:f.state,code:role},f.browser),/YANDEX_LOGIN_INVALID/);
 }
 assert.equal((await ctx.db.pool.query('SELECT count(*)::int n FROM auth_sessions')).rows[0].n,0);
 await ctx.db.pool.query('TRUNCATE customer_oauth_states,rate_limits');
 for(let i=0;i<120;i++)await auth.start('192.0.2.1');
 await assert.rejects(auth.start('192.0.2.1'),/RATE_LIMITED/);
 now=new Date(now.getTime()+300000);await auth.start('192.0.2.1');
});

test('Yandex customer HTTP login in production preserves YCP gates, cookie isolation, CSRF and order ownership',async()=>{
 const app=await buildApp({db:ctx.db,deploymentMode:'ycp',otpSecret:secret,staffSecret:'s'.repeat(32),otpSender:new DisabledOtpSender(),origin,secureCookies:true,
  yandexIdClientId:clientId,yandexIdentityProvider:provider,
  ycp:{token:'t'.repeat(32),settings:{accountId:'oauth-fixture',environment:'production',publicOrigin:origin,priceUnit:null,vat:null,warehouseSource:'database',warehouses:[],button:{enabled:false}}}});
 try{
  assert.deepEqual((await app.inject('/api/store/v1/auth/methods')).json(),{yandex:true,orders:false});
  const cross=await app.inject({method:'POST',url:'/api/store/v1/auth/yandex/start',headers:{origin:'https://evil.example'},payload:{}});assert.equal(cross.statusCode,403);
  const begin=await app.inject({method:'POST',url:'/api/store/v1/auth/yandex/start',headers:{origin},payload:{}});assert.equal(begin.statusCode,200,begin.body);
  const nonce=begin.cookies.find(c=>c.name==='__Host-asaya_yandex_flow')!;
  assert.ok(nonce);assert.ok(nonce.httpOnly);assert.ok(nonce.secure);assert.equal(nonce.sameSite,'Lax');assert.equal(nonce.path,'/');
  const state=new URL(begin.json().url).searchParams.get('state')!;
  const noCookie=await app.inject(yandexCallbackPath+'?state='+state+'&code=123');assert.equal(noCookie.headers.location,'/account/?login=error');
  const finish=await app.inject({url:yandexCallbackPath+'?state='+state+'&code=123',cookies:{[nonce.name]:nonce.value}});
  assert.equal(finish.statusCode,303);assert.equal(finish.headers.location,'/account/');assert.equal(finish.headers['referrer-policy'],'no-referrer');
  const cookie=finish.cookies.find(c=>c.name==='__Host-asaya_session')!;
  assert.ok(cookie.httpOnly);assert.ok(cookie.secure);assert.equal(cookie.sameSite,'Strict');assert.equal(cookie.path,'/');
  assert.ok(!finish.body.includes('123'));const cookies={[cookie.name]:cookie.value};
  const me=await app.inject({url:'/api/store/v1/auth/me',cookies});assert.equal(me.statusCode,200);assert.equal(me.json().role,'customer');
  for(const url of ['/api/admin/v1/auth/me','/api/admin/v1/products','/api/admin/v1/site-pages/home']){
   assert.equal((await app.inject({url,cookies})).statusCode,401);
   assert.equal((await app.inject({url,cookies:{__Host_asaya_staff:cookie.value,'__Host-asaya_staff':cookie.value}})).statusCode,401);
  }
  assert.equal((await app.inject({method:'PUT',url:'/api/admin/v1/site-pages/home',cookies,headers:{origin,'x-csrf-token':me.json().csrfToken},payload:{}})).statusCode,401);
  for(const url of ['/api/store/v1/auth/otp/request','/api/store/v1/checkouts','/api/store/v1/orders/'+randomUUID()+'/cancel'])
   assert.equal((await app.inject({method:'POST',url,cookies,headers:{origin},payload:{}})).statusCode,503);
  assert.equal((await app.inject({url:'/api/v1/warehouses',cookies})).statusCode,401);
  const checkoutUrl='/api/store/v1/yandex/checkout-link',checkoutPayload={items:[{sku:'SKU-OAUTH-FIXTURE',quantity:1}]};
  // A malformed request fails header validation before the disabled-checkout gate.
  const missingKey=await app.inject({method:'POST',url:checkoutUrl,cookies,headers:{origin},payload:checkoutPayload});
  assert.equal(missingKey.statusCode,400);assert.equal(missingKey.json().error,'INVALID_INPUT');
  const disabledCheckout=await app.inject({method:'POST',url:checkoutUrl,cookies,headers:{origin,'idempotency-key':randomUUID()},payload:checkoutPayload});
  assert.equal(disabledCheckout.statusCode,503,disabledCheckout.body);assert.equal(disabledCheckout.json().error,'YANDEX_CHECKOUT_UNAVAILABLE');
  assert.deepEqual((await app.inject({url:'/api/store/v1/orders',cookies})).json().items,[]);
  // A real guest order exists in this disposable database, but belongs to another user.
  const guest=randomUUID(),checkout=randomUUID(),order=randomUUID();
  await ctx.db.pool.query('INSERT INTO users(id,disabled) VALUES($1,true)',[guest]);
  await ctx.db.pool.query("INSERT INTO checkout_sessions(id,user_id,status,snapshot,expires_at) VALUES($1,$2,'placed','{}',now()+interval '1 hour')",[checkout,guest]);
  await ctx.db.pool.query("INSERT INTO orders(id,public_number,checkout_id,user_id,status,payment_status,delivery_status,currency,subtotal_minor,delivery_minor,total_minor,customer_snapshot,delivery_snapshot,consent_snapshot) VALUES($1,'ASAYA-10001',$2,$3,'placed','paid','not_created','RUB',0,0,0,'{}','{}','{}')",[order,checkout,guest]);
  assert.equal((await app.inject({url:'/api/store/v1/orders/'+order,cookies})).statusCode,404);
  assert.deepEqual((await app.inject({url:'/api/store/v1/orders',cookies})).json().items,[]);
  assert.equal((await app.inject({method:'POST',url:'/api/store/v1/auth/logout',cookies,headers:{origin},payload:{}})).statusCode,403);
  assert.equal((await app.inject({method:'POST',url:'/api/store/v1/auth/logout',cookies,headers:{origin,'x-csrf-token':me.json().csrfToken},payload:{}})).statusCode,200);
  assert.equal((await app.inject({url:'/api/store/v1/auth/me',cookies})).statusCode,401);
 }finally{await app.close();}
});
