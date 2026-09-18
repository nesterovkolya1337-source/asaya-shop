import {before,after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {testDatabase} from './postgres.js';
import {StaffAuth,totp,decodeBase32} from '../src/staff-auth.js';
import {AdminCatalog,emptyContent} from '../src/admin-catalog.js';
import {CommerceService,cartHash} from '../src/commerce.js';
import {buildApp} from '../src/app.js';
import {DisabledOtpSender} from '../src/auth.js';
import {hash} from '../src/core.js';
let ctx:Awaited<ReturnType<typeof testDatabase>>;
let clock:Date;
const secret='isolated-staff-master-key-at-least-32-characters',password='Test-Only-Password-9351';
const key='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
before(async()=>{ctx=await testDatabase();});
after(async()=>{await ctx?.stop();});
beforeEach(async()=>{await ctx.db.pool.query('TRUNCATE products,storefront_mappings,warehouses,users,rate_limits,checkout_sessions,idempotency_records,integration_inbox,integration_outbox RESTART IDENTITY CASCADE');clock=new Date('2026-09-06T10:00:00Z');});
const auth=()=>new StaffAuth(ctx.db,secret,()=>clock);
const code=()=>totp(decodeBase32(key),Math.floor(clock.getTime()/30000));
async function staff(){return auth().provision('admin@example.test',password,key);}
function draft(){return {revision:0,sku:'ADMIN-TEST',name:'Тестовый новый товар',slug:'new-admin-test',regularMinor:30000,finalMinor:25000,weightG:300,widthMm:40,heightMm:100,depthMm:40,
 content:{...emptyContent,description:'Тестовое описание',volume:'300 мл',image:'/images/test.webp',usage:'По маркировке',ingredients:'Test ingredients'}};}
test('TOTP matches RFC 6238 vectors including times beyond 2038',()=>{
 for(const [seconds,expected] of [[59,'94287082'],[1111111109,'07081804'],[1234567890,'89005924'],[20000000000,'65353130']] as const)
  assert.equal(totp(Buffer.from('12345678901234567890'),Math.floor(seconds/30),8),expected);
});
test('staff requires password plus unused TOTP; credentials encrypted, session expires and revokes',async()=>{
 const id=await staff(),a=auth();
 await assert.rejects(a.login({email:'admin@example.test',password:'wrong',code:code()},'ip'),/INVALID_STAFF_LOGIN/);
 await assert.rejects(a.login({email:'admin@example.test',password,code:'000000'},'ip'),/INVALID_STAFF_LOGIN/);
 const session=await a.login({email:'ADMIN@example.test',password,code:code()},'ip');
 assert.equal((await a.session(session.token)).user.id,id);
 await assert.rejects(a.login({email:'admin@example.test',password,code:code()},'ip'),/INVALID_STAFF_LOGIN/);
 const r=(await ctx.db.pool.query('SELECT * FROM staff_credentials')).rows[0];assert.notEqual(r.password_hash,password);assert.ok(!r.totp_encrypted.includes(key));
 await a.logout(session.token);await assert.rejects(a.session(session.token),/UNAUTHENTICATED/);
 clock=new Date(clock.getTime()+30000);const next=await a.login({email:'admin@example.test',password,code:code()},'ip');
 clock=new Date(clock.getTime()+3600001);await assert.rejects(a.session(next.token),/UNAUTHENTICATED/);
});
test('staff failures remain rate limited and disabled users lose existing access',async()=>{
 const id=await staff(),a=auth();
 for(let i=0;i<10;i++)await assert.rejects(a.login({email:'admin@example.test',password:'bad',code:code()},'ip'),/INVALID_STAFF_LOGIN/);
 await assert.rejects(a.login({email:'admin@example.test',password,code:code()},'ip'),/RATE_LIMITED/);
 clock=new Date(clock.getTime()+901000);const s=await a.login({email:'admin@example.test',password,code:code()},'ip');
 await ctx.db.pool.query('UPDATE users SET disabled=true WHERE id=$1',[id]);await assert.rejects(a.session(s.token),/UNAUTHENTICATED/);
});
test('draft publication is explicit; valid published edits are live; stale revisions and duplicate SKUs are rejected',async()=>{
 const actor=await staff(),catalog=new AdminCatalog(ctx.db),commerce=new CommerceService(ctx.db),id=randomUUID(),d=draft();
 await catalog.save(actor,id,d);assert.deepEqual(await commerce.catalog(),[]);
 await catalog.publish(actor,id,{revision:1});let items=await commerce.catalog();
 assert.equal(items[0]!.name,d.name);assert.equal(items[0]!.content.description,d.content.description);
 await catalog.save(actor,id,{...d,revision:2,name:'Обновлённое имя',finalMinor:20000});
 assert.equal((await commerce.catalog())[0]!.name,'Обновлённое имя');
 await assert.rejects(catalog.save(actor,id,{...d,revision:2}),/EDIT_CONFLICT/);
 await assert.rejects(catalog.publish(actor,id,{revision:2}),/EDIT_CONFLICT/);
 await catalog.publish(actor,id,{revision:3});items=await commerce.catalog();assert.equal(items[0]!.name,'Обновлённое имя');assert.equal(items[0]!.finalMinor,20000);
 await assert.rejects(catalog.save(actor,randomUUID(),d),/SKU_IN_USE/);
 await catalog.unpublish(actor,id,{revision:4});assert.deepEqual(await commerce.catalog(),[]);
 const actions=(await catalog.history(id)).items;assert.ok(actions.every(r=>r.actor_id===actor));assert.equal(actions.length,5);
});
test('publication checks required content, protects other mappings and never changes source identifiers',async()=>{
 const actor=await staff(),catalog=new AdminCatalog(ctx.db),id=randomUUID(),d=draft();
 await catalog.save(actor,id,{...d,content:{...d.content,image:''}});
 await assert.rejects(catalog.publish(actor,id,{revision:1}),/PUBLISH_INCOMPLETE/);

 await assert.rejects(catalog.save(actor,id,{...d,revision:1,content:{...d.content,image:'javascript:alert(1)'}}));
 const other=randomUUID();await catalog.save(actor,other,{...d,sku:'OTHER'});await catalog.publish(actor,other,{revision:1});
 await catalog.save(actor,id,{...d,revision:1});await assert.rejects(catalog.publish(actor,id,{revision:2}),/SLUG_IN_USE/);
 assert.equal((await ctx.db.pool.query('SELECT product_id FROM storefront_mappings WHERE slug=$1',[d.slug])).rows[0].product_id,other);
});
test('simultaneous editors cannot silently overwrite each other',async()=>{
 const actor=await staff(),catalog=new AdminCatalog(ctx.db),id=randomUUID(),d=draft();
 await catalog.save(actor,id,d);
 const edits=await Promise.allSettled(['First','Second'].map(name=>catalog.save(actor,id,{...d,revision:1,name})));
 assert.equal(edits.filter(e=>e.status==='fulfilled').length,1);
 assert.equal(edits.filter(e=>e.status==='rejected'&&e.reason.code==='EDIT_CONFLICT').length,1);
 assert.equal((await catalog.detail(id)).revision,2);
});
test('stock changes respect reservations, stale quantities and immutable order snapshots',async()=>{
 const actor=await staff(),catalog=new AdminCatalog(ctx.db),id=randomUUID(),d=draft(),warehouse=randomUUID(),buyer=randomUUID(),quote=randomUUID();
 await catalog.save(actor,id,d);await catalog.publish(actor,id,{revision:1});
 await ctx.db.pool.query("INSERT INTO warehouses(id,code,name,active) VALUES($1,'TEST','Test',true)",[warehouse]);
 await catalog.stock(actor,id,{warehouseId:warehouse,expectedOnHand:0,onHand:5});
 await ctx.db.pool.query('INSERT INTO users(id) VALUES($1)',[buyer]);
 const items=[{sku:d.sku,quantity:2}];
 await ctx.db.pool.query("INSERT INTO delivery_quotes(id,user_id,warehouse_id,amount_minor,currency,cart_hash,snapshot,expires_at,environment) VALUES($1,$2,$3,0,'RUB',$4,'{}',now()+interval '1 hour','test')",[quote,buyer,warehouse,cartHash(items)]);
 const commerce=new CommerceService(ctx.db),order=await commerce.createCheckout(buyer,randomUUID(),{items,deliveryQuoteId:quote,customer:{name:'Buyer',phone:'+79990000000'},consent:{offerVersion:'test-v1',privacyVersion:'test-v1',marketing:false}});
 await assert.rejects(catalog.stock(actor,id,{warehouseId:warehouse,expectedOnHand:5,onHand:1}),/STOCK_RESERVED/);
 await catalog.stock(actor,id,{warehouseId:warehouse,expectedOnHand:5,onHand:3});
 await assert.rejects(catalog.stock(actor,id,{warehouseId:warehouse,expectedOnHand:5,onHand:4}),/STOCK_CONFLICT/);
 const detail=await catalog.detail(id);assert.equal(detail.stocks[0]!.onHand,3);assert.equal(detail.stocks[0]!.reserved,2);
 await catalog.save(actor,id,{...d,revision:2,name:'Changed',finalMinor:10000});await catalog.publish(actor,id,{revision:3});
 const old=await commerce.order(buyer,order.orderId);assert.equal(old.items[0]!.name_snapshot,d.name);assert.equal(old.total_minor,50000);
 const snapshot=await commerce.order(buyer,order.orderId);
 assert.deepEqual(await catalog.remove(actor,id,{revision:4,sku:d.sku,confirmed:true}),{outcome:'archived'});
 assert.deepEqual(await commerce.order(buyer,order.orderId),snapshot);
});
test('HTTP staff API rejects customer cookies, requires origin/CSRF and supports saved product flow',async()=>{
 const actor=await staff(),origin='http://127.0.0.1:3200';
 const app=await buildApp({db:ctx.db,otpSecret:secret,staffSecret:secret,otpSender:new DisabledOtpSender(),origin,secureCookies:false});
 try{
  assert.equal((await app.inject({url:'/api/admin/v1/products'})).statusCode,401);
  const buyer=randomUUID(),buyerToken=randomUUID();
  await ctx.db.pool.query('INSERT INTO users(id) VALUES($1)',[buyer]);
  await ctx.db.pool.query("INSERT INTO auth_sessions(token_hash,user_id,csrf_hash,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",[hash(buyerToken),buyer,hash('buyer-csrf')]);
  for(const cookieName of ['asaya_dev_session','asaya_dev_staff'])
   assert.equal((await app.inject({url:'/api/admin/v1/products',headers:{cookie:cookieName+'='+buyerToken}})).statusCode,401);
  const realtimeCode=totp(decodeBase32(key),Math.floor(Date.now()/30000));
  const login=await app.inject({method:'POST',url:'/api/admin/v1/auth/login',headers:{origin},payload:{email:'admin@example.test',password,code:realtimeCode}});assert.equal(login.statusCode,200);
  const cookie=String(login.headers['set-cookie']).split(';')[0]!,headers={origin,cookie,'x-csrf-token':login.json().csrfToken};
  assert.ok(String(login.headers['set-cookie']).includes('HttpOnly'));assert.equal(login.json().user.id,actor);
  assert.equal((await app.inject({url:'/api/store/v1/auth/me',headers:{cookie}})).statusCode,401);
  const id=randomUUID(),url='/api/admin/v1/products/'+id;
  assert.equal((await app.inject({method:'PUT',url,headers:{origin,cookie},payload:draft()})).statusCode,403);
  assert.equal((await app.inject({method:'PUT',url,headers:{...headers,origin:'http://evil.test'},payload:draft()})).statusCode,403);
  assert.equal((await app.inject({method:'PUT',url,headers,payload:draft()})).statusCode,200);
  assert.equal((await app.inject({method:'POST',url:url+'/publish',headers,payload:{revision:1}})).statusCode,200);
  assert.equal((await app.inject({url,headers:{cookie}})).json().active,true);
  const response=await app.inject({url:'/api/admin/v1/products',headers:{cookie}});assert.equal(response.headers['cache-control'],'no-store');assert.equal(response.json().items.length,1);
  await app.inject({method:'POST',url:'/api/admin/v1/auth/logout',headers,payload:{}});
  assert.equal((await app.inject({url,headers:{cookie}})).statusCode,401);
 }finally{await app.close();}
});
test('admin endpoints fail closed when staff authentication is unconfigured',async()=>{
 const app=await buildApp({db:ctx.db,otpSecret:secret,otpSender:new DisabledOtpSender(),origin:'http://127.0.0.1:3200',secureCookies:false});
 try{assert.equal((await app.inject({url:'/api/admin/v1/products'})).statusCode,503);}finally{await app.close();}
});

test('unused hidden SKU can be corrected with audit; published and integrated identifiers remain protected',async()=>{
 const actor=await staff(),catalog=new AdminCatalog(ctx.db),id=randomUUID(),d=draft();await catalog.save(actor,id,d);
 await catalog.save(actor,id,{...d,revision:1,sku:'CORRECT'});assert.equal((await catalog.detail(id)).draft.sku,'CORRECT');
 assert.equal((await ctx.db.pool.query('SELECT sku FROM products WHERE id=$1',[id])).rows[0].sku,'CORRECT');
 assert.equal((await ctx.db.pool.query("SELECT detail FROM audit_log WHERE action='product.sku_corrected'")).rows[0].detail.before,d.sku);
 await assert.rejects(catalog.save(actor,id,{...d,revision:1}),/EDIT_CONFLICT/);
 await catalog.publish(actor,id,{revision:2});await assert.rejects(catalog.save(actor,id,{...d,revision:3}),/SKU_IMMUTABLE/);
 await catalog.unpublish(actor,id,{revision:3});
 await assert.rejects(catalog.save(actor,id,{...d,revision:4}),/SKU_IMMUTABLE/);
 await ctx.db.pool.query("INSERT INTO product_external_ids(provider,environment,account_id,external_id,product_id) VALUES('ycp','test','test','offer',$1)",[id]);
 await assert.rejects(catalog.save(actor,id,{...d,revision:4}),/SKU_IMMUTABLE/);
});
test('placement is private until publication and validates order values',async()=>{
 const actor=await staff(),catalog=new AdminCatalog(ctx.db),commerce=new CommerceService(ctx.db),id=randomUUID(),d=draft();
 const placement={catalogOrder:4,bestsellerOrder:2,newOrder:null};await catalog.save(actor,id,{...d,content:{...d.content,placement}});
 assert.deepEqual(await commerce.catalog(),[]);await catalog.publish(actor,id,{revision:1});assert.deepEqual((await commerce.catalog())[0]!.content.placement,placement);
 await catalog.save(actor,id,{...d,revision:2,content:{...d.content,placement:{catalogOrder:1,bestsellerOrder:null,newOrder:3}}});assert.deepEqual((await commerce.catalog())[0]!.content.placement,{catalogOrder:1,bestsellerOrder:null,newOrder:3});
 for(const catalogOrder of [-1,1.5,100001])await assert.rejects(catalog.save(actor,id,{...d,revision:3,content:{...d.content,placement:{...placement,catalogOrder}}}));
});

test('product list filters draft categories, exposes thumbnails and typed size publishes from the canonical editor',async()=>{
 const actor=await staff(),catalog=new AdminCatalog(ctx.db),id=randomUUID(),d=draft();
 await catalog.save(actor,id,{...d,content:{...d.content,category:'face',size:{value:30.5,unit:'g'}}});
 const list=await catalog.list({category:'face'});assert.equal(list.items.length,1);assert.equal(list.items[0].category,'face');assert.equal(list.items[0].image,d.content.image);
 assert.equal((await catalog.list({category:'body'})).items.length,0);assert.equal((await catalog.detail(id)).draft.content.volume,'30.5 г');
 await catalog.publish(actor,id,{revision:1});assert.equal((await new CommerceService(ctx.db).catalog())[0]!.content.volume,'30.5 г');
 for(const size of [{value:0,unit:'ml'},{value:-1,unit:'g'},{value:2,unit:'unknown'}])await assert.rejects(catalog.save(actor,id,{...d,revision:2,content:{...d.content,size}}));
});
test('physical deletion requires confirmed unused draft and revision; ever-published and referenced products are archived',async()=>{
 const actor=await staff(),catalog=new AdminCatalog(ctx.db),id=randomUUID(),d=draft();await catalog.save(actor,id,d);
 await assert.rejects(catalog.remove(actor,id,{revision:1,sku:d.sku,confirmed:false}));
 await assert.rejects(catalog.remove(actor,id,{revision:0,sku:d.sku,confirmed:true}),/EDIT_CONFLICT/);
 await assert.rejects(catalog.remove(actor,id,{revision:1,sku:'wrong',confirmed:true}),/EDIT_CONFLICT/);
 assert.deepEqual(await catalog.remove(actor,id,{revision:1,sku:d.sku,confirmed:true}),{outcome:'deleted'});
 assert.equal((await ctx.db.pool.query('SELECT 1 FROM products WHERE id=$1',[id])).rowCount,0);
 assert.equal((await ctx.db.pool.query("SELECT 1 FROM audit_log WHERE entity_id=$1 AND action='product.deleted'",[id])).rowCount,1);
 const used=randomUUID();await catalog.save(actor,used,d);await catalog.publish(actor,used,{revision:1});await catalog.unpublish(actor,used,{revision:2});
 assert.deepEqual(await catalog.remove(actor,used,{revision:3,sku:d.sku,confirmed:true}),{outcome:'archived'});assert.equal((await catalog.detail(used)).active,false);
 const linked=randomUUID();await catalog.save(actor,linked,{...d,sku:'LINKED'});await ctx.db.pool.query("INSERT INTO product_external_ids(provider,environment,account_id,external_id,product_id) VALUES('ycp','test','test','offer-linked',$1)",[linked]);
 assert.deepEqual(await catalog.remove(actor,linked,{revision:1,sku:'LINKED',confirmed:true}),{outcome:'archived'});
});


test('lifecycle accepts exactly five business fields, preserves publication and blocks invalid published saves atomically',async()=>{
 const actor=await staff(),catalog=new AdminCatalog(ctx.db),id=randomUUID();
 const d={...draft(),sku:'',slug:'',regularMinor:null,finalMinor:12300,weightG:null,widthMm:null,heightMm:null,depthMm:null,
 content:{...emptyContent,description:'Description',ingredients:'Ingredients',gallery:['/images/test.webp']}};
 await catalog.save(actor,id,{...d,finalMinor:null});assert.equal((await catalog.detail(id)).lifecycle,'draft');
 await assert.rejects(catalog.publish(actor,id,{revision:1}),/PUBLISH_INCOMPLETE/);
 await catalog.save(actor,id,{...d,revision:1});await catalog.publish(actor,id,{revision:2});
 const published=await catalog.detail(id);assert.equal(published.lifecycle,'published');
 assert.equal(published.draft.regularMinor,12300);assert.equal(published.draft.content.image,'/images/test.webp');
 assert.equal((await new CommerceService(ctx.db).catalog())[0]!.available,0);
 for(const [field,patch] of [['name',{name:''}],['description',{content:{...published.draft.content,description:''}}],
 ['ingredients',{content:{...published.draft.content,ingredients:''}}],['image',{content:{...published.draft.content,image:'',gallery:[]}}],
 ['price',{regularMinor:null,finalMinor:null}]] as const){
  await assert.rejects(catalog.save(actor,id,{...published.draft,...patch,revision:3}),new RegExp('PUBLISHED_REQUIRED_'+field));
  assert.deepEqual(await catalog.detail(id),published);
 }
 await catalog.save(actor,id,{...published.draft,revision:3,name:'Saved live'});
 assert.equal((await new CommerceService(ctx.db).catalog())[0]!.name,'Saved live');
 const saved=await catalog.detail(id);await catalog.unpublish(actor,id,{revision:4});
 const hidden=await catalog.detail(id);assert.equal(hidden.lifecycle,'unpublished');assert.deepEqual(hidden.draft,saved.draft);
 assert.deepEqual(await new CommerceService(ctx.db).catalog(),[]);
 await catalog.publish(actor,id,{revision:5});assert.equal((await catalog.detail(id)).lifecycle,'published');
 await catalog.remove(actor,id,{revision:6,sku:published.draft.sku,confirmed:true});
 assert.equal((await catalog.detail(id)).lifecycle,'deleted');
 await assert.rejects(catalog.publish(actor,id,{revision:7}),/PRODUCT_ARCHIVED/);
 await assert.rejects(catalog.save(actor,id,{...published.draft,revision:7}),/PRODUCT_ARCHIVED/);
 assert.deepEqual(await new CommerceService(ctx.db).catalog(),[]);
});
