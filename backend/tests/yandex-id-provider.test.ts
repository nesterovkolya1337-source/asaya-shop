import {test} from 'node:test';
import assert from 'node:assert/strict';
import {YandexIdProvider,pkceChallenge,yandexCallbackPath} from '../src/yandex-id.js';
import {config} from '../src/config.js';
import {Database} from '../src/db.js';
import {buildApp} from '../src/app.js';
import {DisabledOtpSender} from '../src/auth.js';
const id='a'.repeat(32),origin='https://asaya.example.test';
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status});

test('Yandex ID uses the documented PKCE code exchange and keeps tokens server-side',async()=>{
 // RFC 7636 example verifies the S256 transformation independently.
 const verifier='dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
 assert.equal(pkceChallenge(verifier),'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
 let calls=0;
 const provider=new YandexIdProvider(id,origin,async(url,options)=>{
  calls++;assert.equal(options?.redirect,'error');assert.ok(options?.signal);
  if(calls===1){
   assert.equal(url,'https://oauth.yandex.ru/token');assert.equal(options.method,'POST');
   const form=new URLSearchParams(String(options.body));
   assert.deepEqual(Object.fromEntries(form),{grant_type:'authorization_code',client_id:id,code:'test-code',code_verifier:verifier});
   assert.equal(new Headers(options.headers).get('content-type'),'application/x-www-form-urlencoded');
   return json({token_type:'bearer',access_token:'provider-test-access-token'});
  }
  assert.equal(url,'https://login.yandex.ru/info?format=json');
  assert.equal(new Headers(options.headers).get('authorization'),'OAuth provider-test-access-token');
  return json({id:'123456',client_id:id,default_email:'ignored@example.test',real_name:'Ignored'});
 });
 const authorize=new URL(provider.authorize('s'.repeat(43),verifier));
 assert.equal(authorize.origin,'https://oauth.yandex.ru');assert.equal(authorize.pathname,'/authorize');
 assert.equal(authorize.searchParams.get('redirect_uri'),origin+yandexCallbackPath);
 assert.equal(authorize.searchParams.get('response_type'),'code');assert.equal(authorize.searchParams.get('scope'),'login:info');
 assert.equal(authorize.searchParams.get('code_challenge_method'),'S256');
 assert.equal(authorize.searchParams.get('code_challenge'),pkceChallenge(verifier));
 assert.equal(authorize.searchParams.get('state'),'s'.repeat(43));
 assert.deepEqual(await provider.identify('test-code',verifier),{subject:'123456'});assert.equal(calls,2);
});

test('Yandex ID rejects mismatched applications, redirects, oversized and malformed provider replies without leaking them',async()=>{
 const cases=[
  [json({token_type:'bearer',access_token:'sensitive-token'}),json({id:'123',client_id:'b'.repeat(32)})],
  [json({token_type:'bearer',access_token:'sensitive-token'}),json({id:'',client_id:id})],
  [json({token_type:'bearer',access_token:'sensitive\nvalue'})],
  [json({error:'sensitive-error'},400)],
  [new Response('',{status:302,headers:{Location:'https://invalid.example/'}})],
  [new Response('x'.repeat(32769))],
  [new Response('invalid-json')]
 ];
 for(const replies of cases){
  const provider=new YandexIdProvider(id,origin,async()=>replies.shift()!);
  await assert.rejects(provider.identify('private-code','private-verifier'),(error:Error)=>error.message==='YANDEX_LOGIN_UNAVAILABLE');
 }
 const provider=new YandexIdProvider(id,origin,async()=>{throw new Error('sensitive upstream detail');});
 await assert.rejects(provider.identify('private-code','private-verifier'),{message:'YANDEX_LOGIN_UNAVAILABLE'});
});

test('Yandex ID remains opt-in and requires a canonical HTTPS origin and secure cookies',()=>{
 const env={DATABASE_URL:'postgresql://unused:unused@localhost/test',OTP_SECRET:'a'.repeat(32),PUBLIC_ORIGIN:origin};
 assert.equal(config(env).YANDEX_ID_CLIENT_ID,undefined);
 assert.equal(config({...env,YANDEX_ID_CLIENT_ID:id}).YANDEX_ID_CLIENT_ID,id);
 for(const extra of [{COOKIE_SECURE:'false'},{PUBLIC_ORIGIN:'http://asaya.example.test'},{YANDEX_ID_CLIENT_ID:'not-a-client-id'}])
  assert.throws(()=>config({...env,YANDEX_ID_CLIENT_ID:id,...extra}));
 for(const badOrigin of ['https://asaya.example.test/path','https://user@asaya.example.test','http://asaya.example.test','https://asaya.example.test/'])
  assert.throws(()=>new YandexIdProvider(id,badOrigin));
});

test('disabled Yandex login and invalid callbacks cannot touch the database or reflect OAuth credentials',async()=>{
 const db=new Database('postgresql://unused:unused@127.0.0.1:1/unused');
 for(const enabled of [false,true]){
  const app=await buildApp({db,otpSecret:'o'.repeat(32),otpSender:new DisabledOtpSender(),origin,secureCookies:true,
   ...(enabled?{yandexIdClientId:id}:{})});
  try{
   assert.deepEqual((await app.inject('/api/store/v1/auth/methods')).json(),{yandex:enabled,orders:true});
   const callback=await app.inject(yandexCallbackPath+'?code=private-code&error_description=private-detail');
   assert.equal(callback.statusCode,303);assert.equal(callback.headers.location,enabled?'/account/?login=error':'/account/?login=unavailable');
   assert.equal(callback.headers['referrer-policy'],'no-referrer');assert.equal(callback.headers['cache-control'],'no-store');
   assert.ok(!JSON.stringify(callback.headers).includes('private-'));assert.ok(!callback.body.includes('private-'));
   const cross=await app.inject({method:'POST',url:'/api/store/v1/auth/yandex/start',headers:{origin:'https://evil.example'},payload:{}});
   assert.equal(cross.statusCode,403);
   if(!enabled)assert.equal((await app.inject({method:'POST',url:'/api/store/v1/auth/yandex/start',headers:{origin},payload:{}})).statusCode,503);
  }finally{await app.close();}
 }
 await db.close();
});
