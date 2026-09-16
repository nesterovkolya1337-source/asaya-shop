import {test} from 'node:test';
import assert from 'node:assert/strict';
import {config} from '../src/config.js';
import {buildApp} from '../src/app.js';
import {DisabledOtpSender} from '../src/auth.js';
import type {Database} from '../src/db.js';
import type {YcpSettings} from '../src/ycp-catalog.js';

const token='inbound-ycp-verification-only-'+'x'.repeat(32);
const settings:YcpSettings={accountId:'verification',environment:'production',publicOrigin:'https://asaya.example.test',priceUnit:null,vat:null,warehouses:[],button:{enabled:false}};
const options={deploymentMode:'ycp' as const,otpSecret:'o'.repeat(32),staffSecret:'s'.repeat(32),otpSender:new DisabledOtpSender(),origin:'https://asaya.example.test',secureCookies:true,ycp:{token,settings}};

test('working YCP is explicit and cannot activate the foundation or catalog checkout',()=>{
 const env={DATABASE_URL:'postgres://local/test',OTP_SECRET:options.otpSecret,STAFF_SECRET:options.staffSecret,NODE_ENV:'production',DEPLOYMENT_MODE:'ycp',PUBLIC_ORIGIN:options.origin,COOKIE_SECURE:'true',YCP_TOKEN:token,YCP_SETTINGS_FILE:'/run/asaya/ycp.json'};
 assert.equal(config(env).DEPLOYMENT_MODE,'ycp');
 for(const change of [{DEPLOYMENT_MODE:'catalog'},{DEPLOYMENT_MODE:'foundation'},{STAFF_SECRET:undefined},{YCP_TOKEN:undefined},{YCP_SETTINGS_FILE:undefined},{COOKIE_SECURE:'false'},{PUBLIC_ORIGIN:'http://asaya.example.test'}])assert.throws(()=>config({...env,...change}));
});

test('working YCP rejects wrong environment, storefront or reused credentials before DB access',async()=>{
 const db={pool:{query:async()=>{throw new Error('DB should not be accessed');}}} as unknown as Database;
 for(const change of [{secureCookies:false},{staffSecret:undefined},{ycp:undefined},
  {ycp:{token:options.otpSecret,settings}},{ycp:{token:options.staffSecret,settings}},
  {ycp:{token,settings:{...settings,environment:'test'}}},
  {ycp:{token,settings:{...settings,publicOrigin:'https://other.example.test'}}}]){
  await assert.rejects(buildApp({...options,db,...change}));
 }
});

test('both YCP prefixes authenticate every endpoint before parsing or database access',async()=>{
 let reads=0;
 const db={pool:{query:async()=>{reads++;throw new Error('DB should not be accessed');}}} as unknown as Database;
 const app=await buildApp({...options,db});
 try{
  for(const base of ['/api/v1','/api/ycp/v1']){
   for(const [method,path] of [['GET','/warehouses'],['POST','/checkout/basket/check'],['POST','/checkout'],['POST','/checkout/placed'],['POST','/checkout/cancel'],['GET','/order'],['POST','/order/cancel'],['POST','/order/delivered']] as const){
    for(const authorization of [undefined,'Bearer wrong']){
     const response=await app.inject({method,url:base+path,headers:authorization?{authorization}:{},...(method==='POST'?{payload:{}}:{})});
     assert.equal(response.statusCode,401,base+path);
    }
   }
  }
  assert.equal(reads,0);
 }finally{await app.close();}
});

test('YCP mode keeps local checkout, OTP and local-only cancellation disabled',async()=>{
 let reads=0;
 const db={pool:{query:async()=>{reads++;throw new Error('DB should not be accessed');}}} as unknown as Database;
 const app=await buildApp({...options,db});
 try{
  for(const url of ['/api/store/v1/checkouts','/api/store/v1/delivery/quotes','/api/store/v1/auth/otp/request','/api/store/v1/auth/otp/verify','/api/store/v1/orders/00000000-0000-4000-8000-000000000001/cancel','/api/admin/v1/orders/00000000-0000-4000-8000-000000000001/cancel']){
   const response=await app.inject({method:'POST',url,headers:{origin:options.origin},payload:{}});
   assert.equal(response.statusCode,503,url);assert.equal(response.json().error,'YANDEX_CHECKOUT_ONLY');
  }
  const crossOrigin=await app.inject({method:'POST',url:'/api/store/v1/yandex/checkout-link',headers:{origin:'https://wrong.example.test'},payload:{}});
  assert.equal(crossOrigin.statusCode,403);assert.equal(reads,0);
 }finally{await app.close();}
});

test('browser account credentials cannot authorize a YCP payment callback',async()=>{
 let reads=0,writes=0;
 const db={pool:{query:async()=>{reads++;throw new Error('No browser payment queries allowed');}},transaction:async()=>{writes++;throw new Error('No browser payment writes allowed');}} as unknown as Database;
 const headers={origin:options.origin,cookie:'__Host-asaya_session=browser-session; __Host-asaya_staff=staff-session','x-csrf-token':'browser-csrf'};
 for(const configured of [false,true]){
  const app=await buildApp({...options,db,...(configured?{}:{deploymentMode:'foundation',ycp:undefined})});
  try{
   for(const base of ['/api/v1','/api/ycp/v1']){
    for(const payload of [{payment_method:'online'},'{broken']){
     const response=await app.inject({method:'POST',url:base+'/checkout/placed',headers:{...headers,'content-type':'application/json'},payload});
     assert.equal(response.statusCode,configured?401:503);
     assert.equal(response.json().error,configured?'UNAUTHORIZED':'YCP_UNAVAILABLE');
    }
   }
  }finally{await app.close();}
 }
 assert.equal(reads,0);assert.equal(writes,0);
});

test('API discovery does not enable the public buy link or guess tax and price units',async()=>{
 let writes=0;
 const db={pool:{query:async(sql:string)=>{assert.ok(sql.startsWith('SELECT'));return {rows:[]};}},transaction:async()=>{writes++;throw new Error('No writes expected');}} as unknown as Database;
 const app=await buildApp({...options,db});
 try{
  const warehouse=await app.inject({method:'GET',url:'/api/v1/warehouses?limit=10&offset=0',headers:{authorization:'Bearer '+token}});
  assert.equal(warehouse.statusCode,200);assert.deepEqual(warehouse.json(),{warehouses:[],total_count:0});
  const basket=await app.inject({method:'POST',url:'/api/v1/checkout/basket/check',headers:{authorization:'Bearer '+token},payload:{items:[{id:'SKU',quantity:1}],offers_id_from_merchant_center:false,locality:'Москва',is_health_check:true}});
  assert.equal(basket.statusCode,503);assert.equal(basket.json().error,'YCP_PRICING_NOT_CONFIGURED');
  const link=await app.inject({method:'POST',url:'/api/store/v1/yandex/checkout-link',headers:{origin:options.origin,'idempotency-key':'00000000-0000-4000-8000-000000000001'},payload:{items:[{sku:'SKU',quantity:1}]}});
  assert.equal(link.statusCode,503);assert.equal(link.json().error,'YANDEX_CHECKOUT_UNAVAILABLE');assert.equal(writes,0);
 }finally{await app.close();}
});
