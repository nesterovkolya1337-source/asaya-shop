import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SmsAeroSender,smsAeroFromEnv} from '../src/smsaero.js';
const settings={email:'sender@example.test',apiKey:'test-key-for-local-only-0123456789',sign:'ASAYA',mode:'test' as const};
const input={channel:'sms' as const,destination:'8 (999) 123-45-67',code:'042857',challengeId:'test-challenge'};
test('SMS Aero uses documented test endpoint and credentials only in header; returns a minimal receipt',async()=>{
 let calls=0;
 const sender=new SmsAeroSender(settings,async(url,init)=>{
  calls++;assert.equal(url,'https://gate.smsaero.ru/v2/sms/testsend');assert.equal(init?.method,'POST');assert.equal(init?.redirect,'error');
  assert.equal((init?.headers as Record<string,string>).Authorization,'Basic '+Buffer.from(settings.email+':'+settings.apiKey).toString('base64'));
  assert.deepEqual(JSON.parse(String(init?.body)),{number:'79991234567',text:'Код для входа в личный кабинет ASAYA: 042857',sign:'ASAYA'});
  return Response.json({success:true,data:{id:8123,status:0,text:input.code,number:input.destination,other:'private'}});
 });
 assert.deepEqual(await sender.sendOtp(input),{provider:'smsaero',messageId:'8123',status:'0'});assert.equal(calls,1);
});
test('SMS Aero fails closed without duplicate sends or exposing provider responses',async()=>{
 for(const response of [()=>new Response('secret phone OTP',{status:503}),()=>Response.json({success:false,message:'secret phone OTP'}),()=>Response.json({success:true,data:{id:2,status:2}}),()=>Response.json({success:true,data:{}}),()=>new Response('x'.repeat(17000)),()=>{throw new Error(settings.apiKey+' '+input.code);}]){
  let calls=0;const sender=new SmsAeroSender(settings,async()=>{calls++;return response();});
  await assert.rejects(sender.sendOtp(input),e=>e instanceof Error&&e.message==='OTP_DELIVERY_UNAVAILABLE');assert.equal(calls,1);
 }
 let calls=0;const sender=new SmsAeroSender(settings,async()=>{calls++;return Response.json({});});
 await assert.rejects(sender.sendOtp({...input,channel:'email'}));await assert.rejects(sender.sendOtp({...input,code:'123'}));assert.equal(calls,0);
});

test('SMS Aero accepts one documented array receipt and intermediate carrier/moderation statuses without resending',async()=>{
 for(const status of [0,1,3,4,8])for(const array of [false,true]){
  let requests=0;
  const row={id:810675206,status,number:'79991234567',text:input.code,channel:'FREE SIGN',cost:46.9};
  const sender=new SmsAeroSender({...settings,mode:'live'},async(url)=>{requests++;assert.equal(url,'https://gate.smsaero.ru/v2/sms/send');return Response.json({success:true,data:array?[row]:row});});
  assert.deepEqual(await sender.sendOtp(input),{provider:'smsaero',messageId:'810675206',status:String(status)});assert.equal(requests,1);
 }
});

test('SMS Aero rejects wrong recipients, multiple receipts and terminal or unknown failure statuses',async()=>{
 const row={id:123,status:0,number:'79991234567'};
 for(const data of [[],[row,row],[{...row,number:'79991234568'}],{...row,status:2},{...row,status:6},{...row,status:99}]){
  let requests=0;const sender=new SmsAeroSender(settings,async()=>{requests++;return Response.json({success:true,data});});
  await assert.rejects(sender.sendOtp(input),e=>e instanceof Error&&e.message==='OTP_DELIVERY_UNAVAILABLE');assert.equal(requests,1);
 }
});
test('customer SMS requires complete live credentials but not a paid sender/template or obsolete approval flag',()=>{
 assert.equal(smsAeroFromEnv({}).enabled,false);assert.throws(()=>smsAeroFromEnv({CUSTOMER_SMS_ENABLED:'true'}));
 const env={NODE_ENV:'production',CUSTOMER_SMS_ENABLED:'true',OTP_PROVIDER:'smsaero',SMSAERO_EMAIL:settings.email,SMSAERO_API_KEY:settings.apiKey,SMSAERO_SIGN:'ASAYA'};
 assert.throws(()=>smsAeroFromEnv(env));
 assert.equal(smsAeroFromEnv({...env,SMSAERO_MODE:'live',SMSAERO_SIGN:'SMS Aero'}).enabled,true);
 assert.equal(smsAeroFromEnv({...env,SMSAERO_MODE:'live',SMSAERO_OTP_APPROVED:'false'}).enabled,true);
 assert.throws(()=>smsAeroFromEnv({...env,SMSAERO_MODE:'live',SMSAERO_SIGN:''}));
});
