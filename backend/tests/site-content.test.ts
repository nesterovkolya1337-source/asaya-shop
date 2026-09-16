import {after,before,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {testDatabase} from './postgres.js';
import {SiteContent} from '../src/site-content.js';
import {sitePageDefaults} from '../src/site-content-defaults.js';
import {parseSitePage,sitePublicationIssues} from '../src/site-content-format.js';
import {buildApp} from '../src/app.js';
import {StaffAuth,decodeBase32,totp} from '../src/staff-auth.js';
import {DisabledOtpSender} from '../src/auth.js';
let ctx:Awaited<ReturnType<typeof testDatabase>>;
let actor:string;
before(async()=>{ctx=await testDatabase();});after(async()=>{await ctx?.stop();});
beforeEach(async()=>{await ctx.db.pool.query('TRUNCATE site_pages,users,products,rate_limits RESTART IDENTITY CASCADE');actor=randomUUID();await ctx.db.pool.query("INSERT INTO users(id,role) VALUES($1,'admin')",[actor]);});
const draft=()=>parseSitePage(structuredClone(sitePageDefaults.home));
test('image crops follow draft, publish and restore without rewriting source or the other device',async()=>{
 const content=new SiteContent(ctx.db),p=draft(),source=p.blocks[0]!.values.image;
 const crop={desktop:{x:25,y:55,zoom:1.5},mobile:{x:75,y:20,zoom:2}};
 p.blocks[0]!.values.imageCrop=JSON.stringify(crop);
 await content.save(actor,'home',{revision:0,page:p});assert.equal((await content.publicPage('home')).page,null);
 await content.publish(actor,'home',{revision:1});
 p.blocks[0]!.values.imageCrop=JSON.stringify({...crop,mobile:{x:5,y:95,zoom:3}});
 await content.save(actor,'home',{revision:2,page:p});
 assert.deepEqual(JSON.parse((await content.publicPage('home')).page!.blocks[0]!.values.imageCrop!),crop);
 assert.deepEqual(JSON.parse((await content.get('home')).draft.blocks[0]!.values.imageCrop!).desktop,crop.desktop);
 await content.restore(actor,'home',{revision:3});
 const restored=(await content.get('home')).draft.blocks[0]!.values;
 assert.equal(restored.image,source);assert.deepEqual(JSON.parse(restored.imageCrop!),crop);
});
test('content defaults preserve usable pages and reject unsafe media, links and duplicate blocks',()=>{
 for(const p of Object.values(sitePageDefaults))assert.deepEqual(sitePublicationIssues(parseSitePage(p)),[]);
 for(const url of ['javascript:alert(1)','//evil.test','https://user:pass@example.test','/\\evil.test','data:text/html,test']){const p=draft();p.blocks[0]!.values.href=url;assert.throws(()=>parseSitePage(p));}
 for(const url of ['javascript:alert(1)','/images/../private','/api/admin/v1/auth/me']){const p=draft();p.blocks[0]!.values.image=url;assert.throws(()=>parseSitePage(p));}
 const p=draft();p.blocks.push(structuredClone(p.blocks[0]!));assert.throws(()=>parseSitePage(p));
});

test('shared and information documents use independent revisions, private drafts and explicit publication',async()=>{
 const content=new SiteContent(ctx.db);
 const customer=randomUUID();await ctx.db.pool.query("INSERT INTO users(id,role) VALUES($1,'customer')",[customer]);
 for(const id of ['header','footer','returns','requisites','instructions','privacy','personal-data','offer'] as const){
  const p=parseSitePage(structuredClone(sitePageDefaults[id]));
  await assert.rejects(content.save(customer,id,{revision:0,page:p}),/FORBIDDEN/);
  assert.deepEqual(await content.publicPage(id),{page:null});
  await content.save(actor,id,{revision:0,page:p});assert.deepEqual(await content.publicPage(id),{page:null});
  await content.publish(actor,id,{revision:1});const published=(await content.publicPage(id)).page!;
  assert.equal(published.id,id);assert.deepEqual(sitePublicationIssues(parseSitePage(published)),[]);
  p.blocks[0]!.values[Object.keys(p.blocks[0]!.values)[0]!]='Только черновик';
  // Brand images must stay valid; use its human-readable alt when it is first.
  if(p.blocks[0]!.type==='siteBrand'){p.blocks[0]!.values.image=sitePageDefaults[id].blocks[0]!.values.image!;p.blocks[0]!.values.alt='Только черновик';}
  await content.save(actor,id,{revision:2,page:p});assert.deepEqual((await content.publicPage(id)).page,published);
  await content.restore(actor,id,{revision:3});assert.deepEqual((await content.get(id)).draft,parseSitePage(published));
 }
 assert.equal((await content.get('home')).revision,0);
});
test('drafts remain private, publication is explicit, hidden blocks stay private and restore preserves the public version',async()=>{
 const content=new SiteContent(ctx.db),p=draft();assert.equal((await content.get('home')).revision,0);assert.deepEqual(await content.publicPage('home'),{page:null});
 p.blocks[0]!.values.title='Новый заголовок';p.blocks[1]!.visible=false;
 await content.save(actor,'home',{revision:0,page:p});assert.deepEqual(await content.publicPage('home'),{page:null});
 await content.publish(actor,'home',{revision:1});const live=(await content.publicPage('home')).page!;assert.equal(live.blocks[0]!.values.title,'Новый заголовок');assert.equal(live.blocks.length,4);
 p.blocks[0]!.values.title='Пока только черновик';await content.save(actor,'home',{revision:2,page:p});assert.equal((await content.publicPage('home')).page!.blocks[0]!.values.title,'Новый заголовок');
 await content.restore(actor,'home',{revision:3});assert.equal((await content.get('home')).draft.blocks[0]!.values.title,'Новый заголовок');assert.deepEqual((await content.publicPage('home')).page,live);
 const audits=(await ctx.db.pool.query("SELECT action,actor_id,entity_id FROM audit_log WHERE entity_id='site:home' ORDER BY created_at")).rows;assert.equal(audits.length,4);assert.ok(audits.every(r=>r.actor_id===actor));
});
test('page revisions prevent simultaneous lost updates and missing uploaded assets cannot be saved',async()=>{
 const content=new SiteContent(ctx.db),p=draft();await content.save(actor,'home',{revision:0,page:p});
 const results=await Promise.allSettled([content.save(actor,'home',{revision:1,page:p}),content.save(actor,'home',{revision:1,page:p})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected'&&r.reason.code==='EDIT_CONFLICT').length,1);
 await assert.rejects(content.publish(actor,'home',{revision:1}),/EDIT_CONFLICT/);
 p.blocks[0]!.values.image='/api/store/v1/media/'+randomUUID();await assert.rejects(content.save(actor,'home',{revision:2,page:p}),/MEDIA_REFERENCE_MISSING/);assert.equal((await content.get('home')).revision,2);
});
test('disabled staff, mismatched pages and empty publications are rejected',async()=>{
 const content=new SiteContent(ctx.db),p=draft();await assert.rejects(content.save(actor,'about',{revision:0,page:p}),/INVALID_SITE_CONTENT/);
 p.blocks.forEach(b=>b.visible=false);await content.save(actor,'home',{revision:0,page:p});await assert.rejects(content.publish(actor,'home',{revision:1}),/PAGE_INCOMPLETE/);
 await ctx.db.pool.query('UPDATE users SET disabled=true WHERE id=$1',[actor]);await assert.rejects(content.save(actor,'home',{revision:1,page:draft()}),/FORBIDDEN/);await assert.rejects(content.restore(actor,'home',{revision:1}),/FORBIDDEN/);
});
test('HTTP editor works in catalog mode while enforcing staff authentication, origin and CSRF',async()=>{
 const secret='test-site-editor-secret-at-least-32-characters',key='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',password='Test-Only-Content-Editor-12345',origin='http://127.0.0.1:3200';
 await new StaffAuth(ctx.db,secret).provision('site@example.test',password,key);
 const app=await buildApp({db:ctx.db,deploymentMode:'catalog',otpSecret:secret,staffSecret:secret,otpSender:new DisabledOtpSender(),origin,secureCookies:false});
 try{
  assert.equal((await app.inject({url:'/api/admin/v1/site-pages/home'})).statusCode,401);
  const login=await app.inject({method:'POST',url:'/api/admin/v1/auth/login',headers:{origin},payload:{email:'site@example.test',password,code:totp(decodeBase32(key),Math.floor(Date.now()/30000))}});assert.equal(login.statusCode,200);
  const cookie=String(login.headers['set-cookie']).split(';')[0]!,headers={origin,cookie,'x-csrf-token':login.json().csrfToken},payload={revision:0,page:draft()};
  assert.equal((await app.inject({method:'PUT',url:'/api/admin/v1/site-pages/home',headers:{origin,cookie},payload})).statusCode,403);
  assert.equal((await app.inject({method:'PUT',url:'/api/admin/v1/site-pages/home',headers:{...headers,origin:'https://evil.test'},payload})).statusCode,403);
  assert.equal((await app.inject({method:'PUT',url:'/api/admin/v1/site-pages/home',headers,payload})).statusCode,200);
  assert.equal((await app.inject({url:'/api/store/v1/content/home'})).json().page,null);
  assert.equal((await app.inject({method:'POST',url:'/api/admin/v1/site-pages/home/publish',headers,payload:{revision:1}})).statusCode,200);
  const response=await app.inject({url:'/api/store/v1/content/home'});assert.equal(response.json().page.id,'home');assert.equal(response.headers['cache-control'],'no-store');assert.ok(!('draft' in response.json()));
  assert.equal((await app.inject({method:'POST',url:'/api/store/v1/checkouts',headers,payload:{}})).statusCode,503);
 }finally{await app.close();}
});
