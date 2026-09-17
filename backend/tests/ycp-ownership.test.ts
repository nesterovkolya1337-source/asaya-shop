import {test} from 'node:test';
import assert from 'node:assert/strict';
import {config} from '../src/config.js';
import {buildApp} from '../src/app.js';
import {DisabledOtpSender} from '../src/auth.js';

test('legacy fulfillment dispatcher cannot be enabled by valid credentials or any deployment mode',()=>{
 const env={DATABASE_URL:'postgresql://test:test@127.0.0.1/test',OTP_SECRET:'x'.repeat(32)};
 assert.equal(config(env).FULFILLMENT_ENABLED,'false');
 for(const mode of ['foundation','catalog','ycp'])assert.throws(()=>config({...env,DEPLOYMENT_MODE:mode,FULFILLMENT_ENABLED:'true',FULFILLMENT_SETTINGS_FILE:'unused.json',FULFILLMENT_LOGIN:'test',FULFILLMENT_PASSWORD:'test'}),/Yandex Checkout owns shipment creation/);
});

test('application factory rejects obsolete fulfillment wiring before database or provider access',async()=>{
 await assert.rejects(buildApp({db:null as any,fulfillment:{} as any,otpSecret:'x'.repeat(32),otpSender:new DisabledOtpSender(),origin:'http://127.0.0.1',secureCookies:false}),/Yandex Checkout owns shipment creation/);
});
