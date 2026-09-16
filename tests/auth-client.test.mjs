import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAuthClient,parseSession} from '../src/lib/auth-client.ts';

const id='00000000-0000-4000-8000-000000000001';
const session={user:{id,role:'customer'},csrfToken:'a'.repeat(64)};
const reply=(payload,status=200)=>new Response(JSON.stringify(payload),{status,headers:{'Content-Type':'application/json'}});

test('session restore uses the cookie transport and returns a validated customer session',async()=>{
 const client=createAuthClient('/shop/api/store/v1',async(url,options)=>{
  assert.equal(url,'/shop/api/store/v1/auth/me');assert.equal(options.method,'GET');
  assert.equal(options.credentials,'same-origin');assert.equal(options.cache,'no-store');
  assert.ok(options.signal);assert.equal(options.body,undefined);
  return reply({id,role:'customer',csrfToken:session.csrfToken});
 });
 assert.deepEqual(await client.me(),session);
});

test('OTP requests never imply success when the provider is unavailable',async()=>{
 const client=createAuthClient('/api',async(url,options)=>{
  assert.equal(url,'/api/auth/otp/request');assert.equal(options.method,'POST');
  assert.deepEqual(JSON.parse(options.body),{channel:'email',destination:'test@example.test'});
  return reply({error:'OTP_DELIVERY_UNAVAILABLE'},503);
 });
 await assert.rejects(client.sendCode('email',' test@example.test '),error=>error.code==='OTP_DELIVERY_UNAVAILABLE'&&/недоступна/.test(error.message));
});

test('code verification validates the session and logout sends its recovered CSRF token',async()=>{
 const calls=[];
 const client=createAuthClient('/api',async(url,options)=>{
  calls.push({url,options});
  return reply(url.endsWith('/verify')?session:{ok:true});
 });
 const signed=await client.verify(id,'012345');await client.logout(signed);
 assert.deepEqual(JSON.parse(calls[0].options.body),{challengeId:id,code:'012345'});
 assert.equal(calls[1].options.headers['X-CSRF-Token'],session.csrfToken);
 assert.equal(calls[1].options.credentials,'same-origin');
 await assert.rejects(client.verify(id,'123'),error=>error.code==='INVALID_INPUT');
 assert.equal(calls.length,2);
});

test('expired sessions are guests but network failures remain visible errors',async()=>{
 const expired=createAuthClient('/api',async()=>reply({error:'UNAUTHENTICATED'},401));
 assert.equal(await expired.me(),null);await expired.logout(session);
 const network=createAuthClient('/api',async()=>{throw new Error('private network details');});
 await assert.rejects(network.me(),error=>error.code==='NETWORK_ERROR'&&!error.message.includes('private'));
});

test('malformed success and unexpected server messages never create a session or expose details',async()=>{
 for(const payload of [null,{}, {...session,user:{id,role:'admin'}},{...session,csrfToken:'short'}]) assert.throws(()=>parseSession(payload));
 const malformed=createAuthClient('/api',async()=>reply({challengeId:id,expiresInSeconds:300,retryAfterSeconds:-1}));
 await assert.rejects(malformed.sendCode('sms','+79991234567'),error=>error.code==='INVALID_RESPONSE');
 const unknown=createAuthClient('/api',async()=>reply({error:'DATABASE_PASSWORD=secret'},500));
 await assert.rejects(unknown.me(),error=>!error.message.includes('secret'));
});
