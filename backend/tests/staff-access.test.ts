import {before,after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {testDatabase} from './postgres.js';
import {StaffAuth,totp,decodeBase32,OWNER_EMAIL,TRUSTED_SECONDS} from '../src/staff-auth.js';
import {buildApp} from '../src/app.js';
import {DisabledOtpSender} from '../src/auth.js';
let ctx:Awaited<ReturnType<typeof testDatabase>>,clock:Date;
const secret='staff-access-isolated-test-secret-123456789',password='Personal-Password-12345',key='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
const code=(k=key)=>totp(decodeBase32(k),Math.floor(clock.getTime()/30000));
const auth=()=>new StaffAuth(ctx.db,secret,()=>clock);
before(async()=>{ctx=await testDatabase();});after(async()=>{await ctx?.stop();});
beforeEach(async()=>{await ctx.db.pool.query('TRUNCATE users,rate_limits CASCADE');clock=new Date();});
async function activate(a:StaffAuth,owner:string,email='employee@example.test'){
 const invite=await a.createEmployee(owner,{name:'Employee',email,role:'manager'});
 const setup=await a.activationStart({email,password:invite.temporaryPassword},'setup');
 await assert.rejects(a.session(setup.token),/UNAUTHENTICATED/);
 await assert.rejects(a.activationSetup(setup.token),/INVALID_ACTIVATION/);
 await assert.rejects(a.activationPassword(setup.token,{password:invite.temporaryPassword}),/NEW_PASSWORD_REQUIRED/);
 await a.activationPassword(setup.token,{password});
 const material=await a.activationSetup(setup.token);assert.match(material.qrSvg,/<svg/);assert.equal(material.secret.length,32);
 const active=await a.activationConfirm(setup.token,{code:code(material.secret)});
 return {invite,setup,material,active};
}
test('personal activation consumes temporary password, requires new password and TOTP; recovery is hashed and one-use',async()=>{
 const a=auth(),owner=await a.provision(OWNER_EMAIL,password,key),r=await activate(a,owner);
 assert.equal(r.active.user.staffRole,'manager');assert.equal(r.active.recoveryCodes.length,10);
 await assert.rejects(a.activationStart({email:r.invite.email,password:r.invite.temporaryPassword},'setup'),/INVALID_STAFF_LOGIN/);
 await assert.rejects(a.activationSetup(r.setup.token),/UNAUTHENTICATED/);
 const rows=(await ctx.db.pool.query('SELECT code_hash FROM staff_recovery_codes')).rows;
 assert.equal(rows.length,10);assert.ok(rows.every(r=>/^[a-f0-9]{64}$/.test(r.code_hash)));
 const recovered=await a.login({email:r.invite.email,password,code:r.active.recoveryCodes[0]},'login');
 assert.equal(recovered.user.id,r.invite.id);
 await assert.rejects(a.login({email:r.invite.email,password,code:r.active.recoveryCodes[0]},'login'),/INVALID_STAFF_LOGIN/);
 assert.ok(!JSON.stringify(await a.employees(owner)).includes(r.material.secret));
 const other=await activate(a,owner,'other@example.test');assert.notEqual(other.material.secret,r.material.secret);
});
test('owner is protected; roles change immediately; disable, reset and soft deletion revoke access and preserve audit',async()=>{
 const a=auth(),owner=await a.provision(OWNER_EMAIL,password,key),r=await activate(a,owner);
 for(const action of ['role','disable','delete','reset'] as const)await assert.rejects(a.changeEmployee(owner,owner,{action,role:'manager',confirmed:true}),/OWNER_PROTECTED/);
 await assert.rejects(a.employees(r.invite.id),/FORBIDDEN/);
 await a.changeEmployee(owner,r.invite.id,{action:'role',role:'administrator',confirmed:true});
 assert.equal((await a.session(r.active.token)).user.staffRole,'administrator');
 await a.changeEmployee(owner,r.invite.id,{action:'disable',confirmed:true});await assert.rejects(a.session(r.active.token),/UNAUTHENTICATED/);
 await a.changeEmployee(owner,r.invite.id,{action:'enable',confirmed:true});await assert.rejects(a.session(r.active.token),/UNAUTHENTICATED/);
 clock=new Date(clock.getTime()+60000);const live=await a.login({email:r.invite.email,password,code:code(r.material.secret)},'login');
 const reset=await a.changeEmployee(owner,r.invite.id,{action:'reset',confirmed:true});assert.ok(reset.temporaryPassword);
 await assert.rejects(a.session(live.token),/UNAUTHENTICATED/);
 await assert.rejects(a.login({email:r.invite.email,password,code:code(r.material.secret)},'login'),/INVALID_STAFF_LOGIN/);
 await a.changeEmployee(owner,r.invite.id,{action:'delete',confirmed:true});
 assert.ok((await ctx.db.pool.query('SELECT deleted_at FROM staff_credentials WHERE user_id=$1',[r.invite.id])).rows[0].deleted_at);
 assert.ok((await ctx.db.pool.query('SELECT 1 FROM audit_log WHERE entity_id=$1',[r.invite.id])).rowCount!>0);
 assert.equal((await a.employees(owner)).items.length,1);
});
test('temporary credentials expire after seven days; trusted session renews for 90 days and logout revokes it',async()=>{
 const a=auth(),owner=await a.provision(OWNER_EMAIL,password,key);
 const invite=await a.createEmployee(owner,{name:'Expired',email:'expired@example.test',role:'manager'});
 const s=await a.login({email:OWNER_EMAIL,password,code:code()},'owner');
 clock=new Date(clock.getTime()+8*86400000);
 await assert.rejects(a.activationStart({email:invite.email,password:invite.temporaryPassword},'setup'),/INVALID_STAFF_LOGIN/);
 clock=new Date(clock.getTime()+80*86400000);await a.session(s.token);
 clock=new Date(clock.getTime()+80*86400000);await a.session(s.token);
 await a.logout(s.token);await assert.rejects(a.session(s.token),/UNAUTHENTICATED/);
});
test('HTTP uses persistent secure cookies and blocks manager employee/security endpoints before parsing',async()=>{
 const a=auth(),owner=await a.provision(OWNER_EMAIL,password,key),r=await activate(a,owner),origin='https://admin.example.test';
 const app=await buildApp({db:ctx.db,otpSecret:secret,staffSecret:secret,otpSender:new DisabledOtpSender(),origin,secureCookies:true});
 try{
  const login=await app.inject({method:'POST',url:'/api/admin/v1/auth/login',headers:{origin},payload:{email:OWNER_EMAIL,password,code:code()}});assert.equal(login.statusCode,200,login.body);
  const cookies=String(login.headers['set-cookie']);assert.match(cookies,/HttpOnly/);assert.match(cookies,/Secure/);assert.match(cookies,/SameSite=Strict/i);assert.ok(cookies.includes('Max-Age='+TRUSTED_SECONDS));
  const headers={origin,cookie:'__Host-asaya_staff='+r.active.token,'x-csrf-token':r.active.csrfToken};
  for(const url of ['/api/admin/v1/employees','/api/admin/v1/readiness','/api/admin/v1/integration-issues'])assert.equal((await app.inject({url,headers})).statusCode,403,url);
  assert.equal((await app.inject({method:'POST',url:'/api/admin/v1/employees',headers:{...headers,'content-type':'application/json'},payload:'{broken'})).statusCode,403);
  assert.equal((await app.inject({url:'/api/admin/v1/products',headers})).statusCode,200);
  const logout=await app.inject({method:'POST',url:'/api/admin/v1/auth/logout',headers,payload:{}});assert.equal(logout.statusCode,200,logout.body);assert.match(String(logout.headers['set-cookie']),/Max-Age=0/);
  assert.equal((await app.inject({url:'/api/admin/v1/auth/me',headers})).statusCode,401);
 }finally{await app.close();}
});

test('HTTP activation cookie cannot access Admin and requires origin and CSRF before password/TOTP setup',async()=>{
 const a=auth(),owner=await a.provision(OWNER_EMAIL,password,key),origin='https://admin.example.test';
 const invite=await a.createEmployee(owner,{name:'HTTP Employee',email:'http@example.test',role:'manager'});
 const app=await buildApp({db:ctx.db,otpSecret:secret,staffSecret:secret,otpSender:new DisabledOtpSender(),origin,secureCookies:true,deploymentMode:'catalog'});
 try{
  const url='/api/admin/v1/auth/activate/start',payload={email:invite.email,password:invite.temporaryPassword};
  assert.equal((await app.inject({method:'POST',url,headers:{origin:'https://evil.example'},payload})).statusCode,403);
  const start=await app.inject({method:'POST',url,headers:{origin},payload});assert.equal(start.statusCode,200,start.body);
  const cookie=String(start.headers['set-cookie']).split(';')[0]!,csrf=start.json().csrfToken;
  assert.ok(cookie.startsWith('__Host-asaya_staff_setup='));
  assert.equal((await app.inject({url:'/api/admin/v1/products',headers:{cookie}})).statusCode,401);
  assert.equal((await app.inject({method:'POST',url:'/api/admin/v1/auth/activate/password',headers:{origin,cookie},payload:{password}})).statusCode,403);
  const headers={origin,cookie,'x-csrf-token':csrf};
  const changed=await app.inject({method:'POST',url:'/api/admin/v1/auth/activate/password',headers,payload:{password}});assert.equal(changed.statusCode,200,changed.body);
  const setup=await app.inject({url:'/api/admin/v1/auth/activate/setup',headers});assert.equal(setup.statusCode,200,setup.body);assert.equal(setup.headers['cache-control'],'no-store');
  const confirmed=await app.inject({method:'POST',url:'/api/admin/v1/auth/activate/confirm',headers,payload:{code:code(setup.json().secret)}});assert.equal(confirmed.statusCode,200,confirmed.body);
  assert.equal(confirmed.json().recoveryCodes.length,10);assert.match(String(confirmed.headers['set-cookie']),/__Host-asaya_staff=/);
 }finally{await app.close();}
});
