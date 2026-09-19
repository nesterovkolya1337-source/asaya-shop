import {test} from 'node:test';
import assert from 'node:assert/strict';
import {accessTxt,createStaffAccessClient} from '../src/lib/staff-access-client.ts';
import {parseStaffSession} from '../src/lib/admin-client.ts';
test('employee TXT uses actual Admin address without query or authentication secrets',()=>{
 const text=accessTxt({email:'employee@example.test',temporaryPassword:'temporary-test-password',expiresAt:'2026-10-01'},'https://asaya.ru/manage/admin/?secret=bad#fragment');
 assert.ok(text.includes('https://asaya.ru/manage/admin/'));assert.ok(text.includes('temporary-test-password'));
 assert.ok(!text.includes('secret=bad'));assert.ok(!text.includes('fragment'));assert.ok(!text.includes('otpauth'));
});
test('staff role is retained and unsupported roles are rejected',()=>{
 const session={user:{id:'00000000-0000-4000-8000-000000000001',role:'admin',staffRole:'manager'},csrfToken:'a'.repeat(64)};
 assert.equal(parseStaffSession(session).user.staffRole,'manager');
 assert.throws(()=>parseStaffSession({...session,user:{...session.user,staffRole:'guest'}}));
});
test('activation client sends credentials only in body with cookies and CSRF',async()=>{
 let captured;
 const api=createStaffAccessClient('/api/admin/v1',async(url,init)=>{captured={url,init};return new Response(JSON.stringify({stage:'totp'}),{status:200,headers:{'content-type':'application/json'}});});
 await api.password('new-private-password','a'.repeat(64));
 assert.ok(captured.url.endsWith('/auth/activate/password'));assert.equal(captured.init.credentials,'same-origin');assert.ok(captured.init.body.includes('new-private-password'));assert.ok(!captured.url.includes('password='));
});
