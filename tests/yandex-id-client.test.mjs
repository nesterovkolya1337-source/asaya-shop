import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAuthClient} from '../src/lib/auth-client.ts';
const response=(body,status=200)=>new Response(JSON.stringify(body),{status});
const authorize='https://oauth.yandex.ru/authorize?response_type=code&state='+ 's'.repeat(43)+'&code_challenge_method=S256&code_challenge='+ 'v'.repeat(43);
test('customer Yandex login uses same-origin cookies and validates the available methods',async()=>{
 const client=createAuthClient('/api/store/v1',async(url,options)=>{
  assert.equal(options.credentials,'same-origin');assert.equal(options.cache,'no-store');
  if(url.endsWith('/methods')){assert.equal(options.method,'GET');return response({yandex:true,orders:false});}
  assert.equal(url,'/api/store/v1/auth/yandex/start');assert.equal(options.method,'POST');assert.equal(options.body,'{}');return response({url:authorize});
 });
 assert.deepEqual(await client.methods(),{yandex:true,orders:false});assert.equal(await client.startYandex(),authorize);
 await assert.rejects(createAuthClient('/api',async()=>response({yandex:'true',orders:true})).methods(),{code:'INVALID_RESPONSE'});
});
test('customer login never follows an unexpected provider URL or interprets failure as a session',async()=>{
 for(const url of ['https://evil.example/','javascript:alert(1)',authorize.replace('oauth.yandex.ru','oauth.yandex.ru.evil.example'),
  authorize.replace('https:','http:'),authorize.replace('response_type=code','response_type=token'),authorize+'#access_token=oops',
  authorize.replace('code_challenge_method=S256','code_challenge_method=plain'),authorize.replace('https://','https://user@')]){
  await assert.rejects(createAuthClient('/api',async()=>response({url})).startYandex(),{code:'INVALID_RESPONSE'});
 }
 await assert.rejects(createAuthClient('/api',async()=>response({error:'YANDEX_LOGIN_UNAVAILABLE'},503)).startYandex(),{code:'YANDEX_LOGIN_UNAVAILABLE'});
});
