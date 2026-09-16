import {test} from 'node:test';import assert from 'node:assert/strict';
import {config} from '../src/config.js';import {buildApp} from '../src/app.js';import {DisabledOtpSender} from '../src/auth.js';import type {Database} from '../src/db.js';
test('catalog deployment requires MFA secret and HTTPS and cannot enable YCP',()=>{
 const env={DATABASE_URL:'postgres://test:test@localhost/test',OTP_SECRET:'o'.repeat(32),STAFF_SECRET:'s'.repeat(32),NODE_ENV:'production',DEPLOYMENT_MODE:'catalog',PUBLIC_ORIGIN:'https://admin.example.test',COOKIE_SECURE:'true'};
 assert.equal(config(env).DEPLOYMENT_MODE,'catalog');
 for(const change of [{STAFF_SECRET:undefined},{YCP_TOKEN:'y'.repeat(32),YCP_SETTINGS_FILE:'settings.json'},{PUBLIC_ORIGIN:'http://localhost'},{COOKIE_SECURE:'false'}])assert.throws(()=>config({...env,...change}));
});
test('catalog mode blocks order/payment mutations before any database or external access',async()=>{
 let reads=0;const db={pool:{query:async()=>{reads++;throw new Error('unexpected DB access');}}} as unknown as Database;
 const app=await buildApp({db,deploymentMode:'catalog',otpSecret:'o'.repeat(32),staffSecret:'s'.repeat(32),otpSender:new DisabledOtpSender(),origin:'https://admin.example.test',secureCookies:true});
 try{
 for(const url of ['/api/store/v1/checkouts','/api/store/v1/yandex/checkout-link','/api/store/v1/auth/otp/request','/api/admin/v1/orders/00000000-0000-4000-8000-000000000001/dispatch','/api/ycp/v1/checkout']){const r=await app.inject({method:'POST',url,payload:{},headers:{origin:'https://admin.example.test'}});assert.equal(r.statusCode,503);assert.equal(r.json().error,'CATALOG_ONLY');}
 assert.equal(reads,0);
 const login=await app.inject({method:'POST',url:'/api/admin/v1/auth/login',payload:{},headers:{origin:'https://admin.example.test'}});assert.equal(login.statusCode,400);
 const wrongOrigin=await app.inject({method:'PUT',url:'/api/admin/v1/products/00000000-0000-4000-8000-000000000001',payload:{},headers:{origin:'https://evil.test'}});assert.equal(wrongOrigin.statusCode,403);
 }finally{await app.close();}
});
