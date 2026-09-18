import {test,before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {testDatabase} from './postgres.js';
import {CdekStockFeed,parseStockFeed,stockSettingsSchema,StockRateLimitError} from '../src/cdek-stock-feed.js';
import {StockSync} from '../src/stock-sync.js';
import {StockState} from '../src/stock-state.js';
import {YcpCatalog,type YcpSettings} from '../src/ycp-catalog.js';
import {YcpCheckout} from '../src/ycp-checkout.js';
import {CommerceService} from '../src/commerce.js';
import {AdminCatalog} from '../src/admin-catalog.js';
import {YcpOrders} from '../src/ycp-orders.js';
import {YandexFeed} from '../src/yandex-feed.js';
import {AdminStocks} from '../src/admin-stocks.js';
import {buildApp} from '../src/app.js';
import {DisabledOtpSender} from '../src/auth.js';
import {StaffAuth} from '../src/staff-auth.js';
import {hash} from '../src/core.js';
let ctx:Awaited<ReturnType<typeof testDatabase>>;
before(async()=>{ctx=await testDatabase();});after(async()=>{await ctx?.stop();});
beforeEach(async()=>{await ctx.db.pool.query('TRUNCATE products,warehouses,users,customer_profiles,checkout_sessions,integration_inbox,integration_outbox CASCADE');});
const token='stock-source-test-token-of-at-least-32-characters';
const feedUrl='https://static.integrations.ffcdek.ru/export_products/yml/'+ '0'.repeat(32)+'.xml';
const xml=(at:Date,n:number,extra='')=>`<?xml version="1.0"?><yml_catalog date="${at.toISOString().replace(/\.\d{3}Z$/,'Z')}"><shop><offers><offer id="SKU-1"><param code="article">SKU-1</param><count>${n}</count></offer>${extra}</offers></shop></yml_catalog>`;
const content={description:'Description',volume:'300 ml',category:'body',setKind:'none',usage:'',ingredients:'',aroma:'',features:[],image:'/images/test.webp',gallery:[],badge:'',instruction:{steps:[],amount:'',tip:''},safety:'',recommendations:[],sensory:[]};
async function fixture(){
 const db=ctx.db,warehouse=randomUUID(),product=randomUUID(),actor=randomUUID();
 const at=new Date(Math.floor(Date.now()/1000)*1000-1000);
 await db.pool.query("INSERT INTO warehouses(id,code,name,active) VALUES($1,'MSK-TEST','FF stock test',true)",[warehouse]);
 await db.pool.query("INSERT INTO warehouse_external_ids(provider,account_id,external_id,warehouse_id) VALUES('cdek_ff','asaya','23401',$1)",[warehouse]);
 await db.pool.query("INSERT INTO products(id,sku,name,active,sale_approved,weight_g,width_mm,height_mm,depth_mm) VALUES($1,'SKU-1','Canonical product',true,true,500,50,190,50)",[product]);
 await db.pool.query("INSERT INTO product_prices(product_id,currency,regular_minor,final_minor,approved) VALUES($1,'RUB',60000,50000,true)",[product]);
 await db.pool.query("INSERT INTO storefront_mappings(slug,product_id,approved,confidence,reason) VALUES('canonical-gel',$1,true,'high','test')",[product]);
 await db.pool.query("INSERT INTO users(id,role) VALUES($1,'admin')",[actor]);
 await db.pool.query('INSERT INTO product_editor(product_id,revision,draft,published,published_at,updated_by) VALUES($1,1,$2,$2,now(),$3)',[product,JSON.stringify({content}),actor]);
 const source=new CdekStockFeed({warehouseId:warehouse,accountId:'asaya',externalWarehouseId:'23401',environment:'production',feedUrl});
 const sync=new StockSync(db,source),settings:YcpSettings={accountId:'stock-test',environment:'production',publicOrigin:'https://asaya.example.test',priceUnit:'minor',vat:0,checkout:{deliveryPriceUnit:'rubles'},warehouses:[{warehouseId:warehouse,address:'Test',phone:'+79990000000',servedLocalities:['*'],ycpDeliveryEnabled:false}]};
 const basket=new YcpCatalog(db,token,settings,true),checkout=new YcpCheckout(db,settings,undefined,true);
 const request={items:[{id:'SKU-1',quantity:1}],offers_id_from_merchant_center:false,locality:'Москва',is_health_check:false};
 const body={session_id:'session-1',warehouse_id:warehouse,items:[{id:'SKU-1',quantity:1,regular_price:600,final_price:500}],customer:{full_name:'Test',phone:'+79990000000',email:'buyer@example.test'},delivery:{delivery_method:'courier',service_type:'cdek',price:100,address:{locality:'Москва',address:'Test'},delivery_date_interval:{start_interval:{date:'2026-10-01'},end_interval:{date:'2026-10-02'},time_zone:3}}};
 const available=async()=>(await basket.basket(request)).items[0]!.warehouses[0].available_quantity;
 return {db,warehouse,product,actor,at,source,sync,settings,basket,checkout,request,body,available};
}

test('admin stock report reads shared quantities and canonical metadata; never substitutes missing with zero',async()=>{
 const f=await fixture(),service=new AdminStocks(f.db,f.sync);
 assert.equal((await service.read(f.actor,{})).items[0]!.quantity,null);
 await f.sync.apply(parseStockFeed(xml(f.at,0)));
 const r=await service.read(f.actor,{}),shared=await new StockState(f.db,f.source.settings).read();
 assert.deepEqual(r.items,shared.items);assert.equal(r.items[0]!.quantity,0);assert.equal(r.items[0]!.name,'Canonical product');assert.equal(r.items[0]!.category,'body');assert.equal(r.items[0]!.image,'/images/test.webp');
 await f.db.pool.query("INSERT INTO products(id,sku,name) VALUES($1,'MISSING','Missing product')",[randomUUID()]);
 assert.equal((await service.read(f.actor,{})).items.find(i=>i.sku==='MISSING')!.quantity,null);
 await assert.rejects(service.read(randomUUID(),{}),/FORBIDDEN/);
 await assert.rejects(service.refresh(f.actor,{quantity:99}));
 assert.deepEqual(await new AdminStocks(f.db).read(f.actor,{}),{configured:false,source:null,items:[]});
});

test('admin refresh shares worker lock and schedule, exposes changed quantity, preserves successful snapshot after error',async()=>{
 const f=await fixture();let calls=0,quantity=3,at=new Date(),fail=false;
 const source=new CdekStockFeed(f.source.settings,async()=>{calls++;await new Promise(r=>setTimeout(r,25));return fail?new Response('private-secret',{status:500}):new Response(xml(at,quantity));});
 const service=new AdminStocks(f.db,new StockSync(f.db,source));
 const results=await Promise.all(Array.from({length:5},()=>service.refresh(f.actor,{})));
 assert.equal(calls,1);assert.equal(results.filter(r=>r.outcome==='updated').length,1);
 assert.equal((await service.refresh(f.actor,{})).outcome,'not_due');assert.equal(calls,1);
 quantity=7;at=new Date(+at+1000);await f.db.pool.query("UPDATE stock_sources SET next_attempt_at=now()-interval '1 second'");
 await service.refresh(f.actor,{});const good=await service.read(f.actor,{});assert.equal(good.items[0]!.quantity,7);
 fail=true;await f.db.pool.query("UPDATE stock_sources SET next_attempt_at=now()-interval '1 second'");
 await assert.rejects(service.refresh(f.actor,{}),/STOCK_REFRESH_FAILED/);const bad=await service.read(f.actor,{});
 assert.equal(bad.items[0]!.quantity,7);assert.deepEqual(bad.source!.syncedAt,good.source!.syncedAt);assert.equal(bad.source!.syncStatus,'error');assert.ok(!JSON.stringify(bad).includes('private-secret'));
});

test('stock HTTP routes require staff, origin and CSRF in catalog and YCP mode; reject quantity writes',async()=>{
 const f=await fixture(),origin='https://asaya.example.test',staffSecret='s'.repeat(32),staffToken='a'.repeat(64);
 const staffId=await new StaffAuth(f.db,staffSecret).provision('stocks@example.test','Test-only-password-12345','GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
 await f.db.pool.query("INSERT INTO staff_sessions(token_hash,user_id,created_at,expires_at) VALUES($1,$2,now(),now()+interval '1 hour')",[hash(staffToken),staffId]);
 const csrf=(await new StaffAuth(f.db,staffSecret).session(staffToken)).csrfToken;
 for(const deploymentMode of ['catalog','ycp'] as const){
 const app=await buildApp({db:f.db,stock:f.sync,deploymentMode,origin,staffSecret,otpSecret:'o'.repeat(32),otpSender:new DisabledOtpSender(),secureCookies:true,...(deploymentMode==='ycp'?{ycp:{token,settings:f.settings}}:{})});
 try{
  const url='/api/admin/v1/analytics/stocks',headers={origin,cookie:'__Host-asaya_staff='+staffToken,'x-csrf-token':csrf};
  assert.equal((await app.inject({url})).statusCode,401);
  const r=await app.inject({url,headers});assert.equal(r.statusCode,200);assert.equal(r.headers['cache-control'],'no-store');
  assert.equal((await app.inject({url:url+'/refresh',method:'POST',headers:{cookie:headers.cookie,origin},payload:{}})).statusCode,403);
  assert.equal((await app.inject({url:url+'/refresh',method:'POST',headers:{...headers,origin:'https://evil.test'},payload:{}})).statusCode,403);
  assert.equal((await app.inject({url:url+'/refresh',method:'POST',headers,payload:{quantity:9}})).statusCode,400);
  await f.sync.apply(parseStockFeed(xml(f.at,4)));
  const refresh=await app.inject({url:url+'/refresh',method:'POST',headers,payload:{}});assert.equal(refresh.statusCode,200);assert.equal(refresh.json().outcome,'not_due');
 }finally{await app.close();}
 }
});
test('FF parser accepts exact article/count contract and rejects unsafe or ambiguous XML',()=>{
 const at=new Date('2026-09-17T00:00:00Z');assert.deepEqual(parseStockFeed(xml(at,4)).items,[{sku:'SKU-1',quantity:4}]);
 for(const bad of [xml(at,-1),xml(at,1.5),xml(at,1000001),xml(at,1).replace('<count>1</count>',''),xml(at,1).replace('code="article"','code="barcode"'),xml(at,1).replace('id="SKU-1"','id="different"'),xml(at,1).replace('</offers>','<offer id="SKU-1"><param code="article">SKU-1</param><count>1</count></offer></offers>'),xml(at,1).replace('</offer>','<count>2</count></offer>'),xml(at,1).replace('</shop>',''),xml(at,1).replace('<shop>','<!DOCTYPE evil [<!ENTITY x SYSTEM "file:///secret">]><shop>'),'<html/>'])assert.throws(()=>parseStockFeed(bad),/STOCK_FEED_INVALID/);
 for(const url of ['http://static.integrations.ffcdek.ru/a.xml','https://evil.test/a.xml',feedUrl+'?token=x',feedUrl.replace('https://','https://user@')])assert.equal(stockSettingsSchema.safeParse({warehouseId:randomUUID(),accountId:'a',externalWarehouseId:'1',environment:'test',feedUrl:url}).success,false);
});

test('packet 03 basket quantity is a purchase ceiling from shared stock, never a second provider snapshot',async()=>{
 const f=await fixture();let generation=f.at;
 for(const [stock,requested] of [[10,1],[1,2],[0,1]]){
  generation=new Date(+generation+1000);await f.sync.apply(parseStockFeed(xml(generation,stock!)));
  const response=await f.basket.basket({...f.request,items:[{id:'SKU-1',quantity:requested}]});
  assert.equal(response.items[0]!.warehouses[0].available_quantity,stock);
  assert.equal(response.items[0]!.final_price,500);
  assert.equal((await new StockState(f.db,f.source.settings).read()).items[0]!.quantity,stock);
 }
 await assert.rejects(f.basket.basket({...f.request,items:[{id:'SKU-1',quantity:1,final_price:1}]}));
 await assert.rejects(f.basket.basket({...f.request,items:[{id:'SKU-1',quantity:1.5}]}));
 generation=new Date(+generation+1000);await f.sync.apply(parseStockFeed(xml(generation,10)));
 await f.db.pool.query("UPDATE stock_sources SET expires_at=now()-interval '1 second'");
 assert.equal(await f.available(),0);const stale=await new StockState(f.db,f.source.settings).read();
 assert.equal(stale.items[0]!.quantity,10);assert.equal(stale.source.syncStatus,'stale');
 generation=new Date(+generation+1000);await f.sync.apply(parseStockFeed(xml(generation,10).replaceAll('SKU-1','OTHER-SKU')));
 assert.equal(await f.available(),0);assert.equal((await new StockState(f.db,f.source.settings).read()).items[0]!.quantity,null);
});
test('stock provider uses bounded GET only with timeout, no redirects, sanitized errors',async()=>{
 const settings={warehouseId:randomUUID(),accountId:'asaya',externalWarehouseId:'23401',environment:'production',feedUrl};
 let calls=0;const source=new CdekStockFeed(settings,async(url,init)=>{calls++;assert.equal(url,feedUrl);assert.equal(init?.method,'GET');assert.equal(init?.redirect,'error');assert.ok(init?.signal);return new Response(xml(new Date(),0));});
 assert.equal((await source.read()).items[0]!.quantity,0);assert.equal(calls,1);
 for(const response of [new Response('secret',{status:500}),new Response('x'.repeat(2*1024*1024+1)),new Response('<broken>')])await assert.rejects(new CdekStockFeed(settings,async()=>response).read(),e=>e instanceof Error&&e.message==='STOCK_SOURCE_UNAVAILABLE');
});
test('production ignores manual stock; FF exact SKU drives canonical catalog and YCP',async()=>{
 const f=await fixture();await f.db.pool.query('INSERT INTO inventory_balances(product_id,warehouse_id,on_hand) VALUES($1,$2,999)',[f.product,f.warehouse]);assert.equal(await f.available(),0);
 await f.sync.apply(parseStockFeed(xml(f.at,7)));assert.equal(await f.available(),7);
 const catalog=await new CommerceService(f.db,undefined,'production').catalog();assert.equal(catalog[0]!.available,7);assert.equal(catalog[0]!.name,'Canonical product');assert.equal(catalog[0]!.slug,'canonical-gel');assert.deepEqual(catalog[0]!.content,content);
 const detail=await new AdminCatalog(f.db).detail(f.product);assert.equal(detail.stocks[0]!.onHand,7);
 await assert.rejects(new AdminCatalog(f.db).stock(f.actor,f.product,{warehouseId:f.warehouse,expectedOnHand:7,onHand:100}),/STOCK_MANAGED_BY_PROVIDER/);
 assert.equal((await f.db.pool.query('SELECT count(*)::int n FROM orders')).rows[0].n,0);
});
test('zero and insufficient block checkout; one of eight concurrent sessions gets the last unit',async()=>{
 const f=await fixture();await f.sync.apply(parseStockFeed(xml(f.at,0)));assert.equal(await f.available(),0);await assert.rejects(f.checkout.create(f.body),/INVENTORY_CHANGED/);
 const newer=new Date(+f.at+1000);await f.sync.apply(parseStockFeed(xml(newer,1)));
 await assert.rejects(f.checkout.create({...f.body,items:[{...f.body.items[0],quantity:2}]}),/INVENTORY_CHANGED/);
 const outcomes=await Promise.allSettled(Array.from({length:8},(_,i)=>f.checkout.create({...f.body,session_id:'race-'+i})));
 assert.equal(outcomes.filter(o=>o.status==='fulfilled').length,1);for(const o of outcomes)if(o.status==='rejected')assert.match(o.reason.message,/INVENTORY_CHANGED/);
 assert.equal(await f.available(),0);await f.sync.apply(parseStockFeed(xml(newer,1)));assert.equal(await f.available(),0);
 assert.deepEqual((await f.db.pool.query('SELECT on_hand,reserved FROM inventory_balances')).rows[0],{on_hand:1,reserved:1});
});
test('decline below reservation preserves orders and cancellation never resurrects stock',async()=>{
 const f=await fixture();await f.sync.apply(parseStockFeed(xml(f.at,2)));await f.checkout.create(f.body);
 await f.sync.apply(parseStockFeed(xml(new Date(+f.at+1000),0)));assert.equal(await f.available(),0);
 assert.deepEqual((await f.db.pool.query('SELECT on_hand,reserved FROM inventory_balances')).rows[0],{on_hand:1,reserved:1});
 await f.checkout.cancel({session_id:f.body.session_id});assert.equal(await f.available(),0);
});
test('stale, conflicting, regressed, wrong-scope or failed source cannot enable sales',async()=>{
 const f=await fixture();await f.sync.apply(parseStockFeed(xml(f.at,5)));
 await assert.rejects(f.sync.apply(parseStockFeed(xml(new Date(+f.at-1000),99))),/REGRESSED/);
 await assert.rejects(f.sync.apply(parseStockFeed(xml(f.at,99))),/VERSION_CONFLICT/);
 await assert.rejects(f.sync.apply(parseStockFeed(xml(new Date(+f.at-3600000),99))),/STALE/);
 await assert.rejects(new StockSync(f.db,new CdekStockFeed({...f.source.settings,externalWarehouseId:'1'})).apply(parseStockFeed(xml(f.at,1))),/SCOPE_MISMATCH/);
 await f.db.pool.query("UPDATE stock_sources SET expires_at=now()-interval '1 second'");assert.equal(await f.available(),0);await assert.rejects(f.checkout.create(f.body),/INVENTORY_CHANGED/);
 await f.sync.apply(parseStockFeed(xml(f.at,5)));assert.equal(await f.available(),5);
 await f.db.pool.query('UPDATE stock_sources SET next_attempt_at=NULL');
 const failing=new StockSync(f.db,new CdekStockFeed(f.source.settings,async()=>{throw new Error('private URL');}));await assert.rejects(failing.refresh(),/STOCK_REFRESH_FAILED/);assert.equal(await f.available(),0);
});

test('shared stock state distinguishes confirmed zero, missing SKU and no successful sync',async()=>{
 const f=await fixture();
 await f.db.pool.query("INSERT INTO products(id,sku,name) VALUES($1,'MISSING','Not in feed')",[randomUUID()]);
 let now=new Date(+f.at+1000);const state=new StockState(f.db,f.source.settings,()=>now);
 const initial=await state.read();assert.equal(initial.source.syncStatus,'never_synced');
 assert.ok(initial.items.every(i=>i.quantity===null&&i.quantityState==='not_synced'&&i.syncedAt===null));
 await f.sync.apply(parseStockFeed(xml(f.at,0)));
 const zero=await state.read();assert.equal(zero.items.find(i=>i.sku==='SKU-1')!.quantity,0);
 assert.equal(zero.items.find(i=>i.sku==='SKU-1')!.quantityState,'known');
 assert.equal(zero.items.find(i=>i.sku==='MISSING')!.quantity,null);
 assert.equal(zero.items.find(i=>i.sku==='MISSING')!.quantityState,'missing');
 assert.equal(zero.source.syncStatus,'fresh');assert.ok(!JSON.stringify(zero).includes(feedUrl));
 now=new Date(+zero.source.expiresAt+1);assert.equal((await state.read()).source.syncStatus,'stale');
 assert.equal((await state.read()).items.find(i=>i.sku==='SKU-1')!.quantity,0);
 await assert.rejects(new StockState(f.db,{...f.source.settings,accountId:'other'}).read(),/SCOPE_MISMATCH/);
 await assert.rejects(new StockState(f.db,{...f.source.settings,environment:'test'}).read(),/CHANGE_REQUIRES_REVIEW/);
});

test('first sync failure records safe diagnostics, retry schedule and recovers without invented zero',async()=>{
 const f=await fixture();let now=new Date(+f.at+1000),fail=true,calls=0;
 const source=new CdekStockFeed(f.source.settings,async()=>{calls++;if(fail)throw new Error('secret URL / personal data');return new Response(xml(now,6));});
 const sync=new StockSync(f.db,source,()=>now),state=new StockState(f.db,source.settings,()=>now);
 await assert.rejects(sync.refresh(),/STOCK_REFRESH_FAILED/);
 const failed=await state.read();assert.equal(failed.source.syncStatus,'error');
 assert.equal(failed.source.lastError,'STOCK_SOURCE_UNAVAILABLE');assert.equal(failed.source.syncedAt,null);
 assert.equal(failed.items[0]!.quantity,null);assert.equal(failed.items[0]!.quantityState,'not_synced');
 assert.equal(failed.source.consecutiveFailures,1);
 assert.deepEqual(await sync.refresh(),{skipped:true,reason:'not_due'});assert.equal(calls,1);
 now=new Date(+failed.source.nextAttemptAt);fail=false;await sync.refresh();
 const recovered=await state.read();assert.equal(recovered.items[0]!.quantity,6);
 assert.equal(recovered.source.syncStatus,'fresh');assert.equal(recovered.source.lastError,null);
 assert.equal(recovered.source.consecutiveFailures,0);assert.equal(+recovered.source.syncedAt,+now);
});

test('failed refresh preserves successful provider snapshot, timestamp and inventory reservations',async()=>{
 const f=await fixture();await f.sync.apply(parseStockFeed(xml(f.at,5)));await f.checkout.create(f.body);
 const state=new StockState(f.db,f.source.settings),before=await state.read();
 const balances=(await f.db.pool.query('SELECT * FROM inventory_balances')).rows;
 await f.db.pool.query('UPDATE stock_sources SET next_attempt_at=NULL');
 const sync=new StockSync(f.db,new CdekStockFeed(f.source.settings,async()=>new Response('private server error',{status:500})));
 await assert.rejects(sync.refresh(),/STOCK_REFRESH_FAILED/);
 const after=await state.read();assert.equal(after.items[0]!.quantity,5);assert.equal(after.source.syncStatus,'error');
 assert.deepEqual(after.source.syncedAt,before.source.syncedAt);assert.deepEqual(after.source.sourceUpdatedAt,before.source.sourceUpdatedAt);
 assert.deepEqual((await f.db.pool.query('SELECT * FROM inventory_balances')).rows,balances);
 assert.equal((await f.db.pool.query("SELECT count(*)::int n FROM inventory_reservations WHERE status='active'")).rows[0].n,1);
 await f.db.pool.query("UPDATE stock_sources SET last_error='unsafe provider body'");
 assert.equal((await state.read()).source.lastError,'STOCK_REFRESH_FAILED');
 await f.db.pool.query('UPDATE stock_sources SET next_attempt_at=NULL');
 await new StockSync(f.db,new CdekStockFeed(f.source.settings,async()=>new Response(xml(f.at,5)))).refresh();
 assert.equal((await state.read()).source.syncStatus,'fresh');assert.equal((await state.read()).source.lastError,null);
 assert.deepEqual((await f.db.pool.query('SELECT * FROM inventory_balances')).rows,balances);
});

test('concurrent workers fetch a warehouse once and mismatched configuration cannot poison its state',async()=>{
 const f=await fixture();let calls=0,unblock!:()=>void,started!:()=>void;
 const gate=new Promise<void>(r=>{unblock=r;}),ready=new Promise<void>(r=>{started=r;});
 const source=new CdekStockFeed(f.source.settings,async()=>{calls++;started();await gate;return new Response(xml(f.at,4));});
 const first=new StockSync(f.db,source).refresh();await ready;
 try{assert.deepEqual(await new StockSync(f.db,source).refresh(),{skipped:true,reason:'in_progress'});}
 finally{unblock();}await first;assert.equal(calls,1);
 assert.deepEqual(await new StockSync(f.db,source).refresh(),{skipped:true,reason:'not_due'});
 const before=await new StockState(f.db,source.settings).read();
 await assert.rejects(new StockSync(f.db,new CdekStockFeed({...source.settings,environment:'test'},async()=>{throw new Error('must not fetch');})).refresh(),/CHANGE_REQUIRES_REVIEW/);
 assert.deepEqual(await new StockState(f.db,source.settings).read(),before);
});

test('provider rate limit is sanitized and Retry-After prevents early polling across worker restarts',async()=>{
 const f=await fixture();let now=new Date(+f.at+1000),calls=0;
 const source=new CdekStockFeed({...f.source.settings,pollSeconds:60},async()=>{calls++;return new Response('private body',{status:429,headers:{'Retry-After':'7200'}});});
 await assert.rejects(source.read(),e=>e instanceof StockRateLimitError&&e.retryAfterSeconds===7200);
 calls=0;await assert.rejects(new StockSync(f.db,source,()=>now).refresh(),/STOCK_REFRESH_FAILED/);
 const state=await new StockState(f.db,source.settings,()=>now).read();
 assert.equal(state.source.lastError,'STOCK_SOURCE_RATE_LIMITED');assert.equal(+state.source.nextAttemptAt,+now+7200000);
 now=new Date(+now+60000);assert.deepEqual(await new StockSync(f.db,source,()=>now).refresh(),{skipped:true,reason:'not_due'});assert.equal(calls,1);
 assert.equal(stockSettingsSchema.parse({...source.settings,pollSeconds:900}).pollSeconds,900);
});

test('diagnostic migration preserves a pre-existing successful source snapshot',async()=>{
 const f=await fixture();await f.sync.apply(parseStockFeed(xml(f.at,3)));
 const sql=await readFile('migrations/028_stock_sync_diagnostics.sql','utf8');
 await f.db.transaction(async tx=>{
  // A transaction-local copy of the old shape; no changes to the actual test source.
  await tx.query(`CREATE TEMP TABLE stock_sources (LIKE public.stock_sources INCLUDING ALL) ON COMMIT DROP;
   ALTER TABLE stock_sources DROP CONSTRAINT stock_success_has_snapshot,
    DROP COLUMN last_attempt_at,DROP COLUMN next_attempt_at,DROP COLUMN consecutive_failures,
    ALTER COLUMN generated_at SET NOT NULL,ALTER COLUMN fetched_at SET NOT NULL,
    ALTER COLUMN expires_at SET NOT NULL,ALTER COLUMN payload_hash SET NOT NULL;
   INSERT INTO stock_sources SELECT warehouse_id,source_hash,environment,generated_at,fetched_at,expires_at,
    payload_hash,healthy,last_error,unknown_skus FROM public.stock_sources`);
  const before=(await tx.query('SELECT * FROM stock_sources')).rows[0];
  await tx.query(sql);
  const after=(await tx.query('SELECT * FROM stock_sources')).rows[0];
  assert.deepEqual(after,{...before,last_attempt_at:null,next_attempt_at:null,consecutive_failures:0});
 });
});

test('documented 30-minute export cadence fits freshness policy without refreshing provider age',async()=>{
 const f=await fixture();let now=new Date(+f.at+31*60000);
 const sync=new StockSync(f.db,f.source,()=>now),state=new StockState(f.db,f.source.settings,()=>now);
 await sync.apply(parseStockFeed(xml(f.at,2)));
 const snapshot=await state.read();assert.equal(snapshot.source.syncStatus,'fresh');
 assert.equal(+snapshot.source.expiresAt,+f.at+40*60000);
 now=new Date(+f.at+40*60000);
 assert.equal((await state.read()).source.syncStatus,'stale');
 await assert.rejects(sync.apply(parseStockFeed(xml(f.at,2))),/STOCK_SOURCE_STALE/);
 assert.equal((await state.read()).items[0]!.quantity,2);
});
test('unknown or missing SKU is unavailable; sync cannot invent products or approximate a SKU',async()=>{
 const f=await fixture(),other='<offer id="SKU-01"><param code="article">SKU-01</param><count>100</count></offer>';
 const result=await f.sync.apply(parseStockFeed(xml(f.at,0,other)));assert.deepEqual(result.unknownSkus,['SKU-01']);assert.equal(await f.available(),0);
 await f.sync.apply(parseStockFeed(xml(new Date(+f.at+1000),4)));assert.equal(await f.available(),4);
 await f.sync.apply(parseStockFeed(xml(new Date(+f.at+2000),4).replace(/<offer [\s\S]*<\/offer>/,'')));assert.equal(await f.available(),0);
 assert.equal((await f.db.pool.query('SELECT count(*)::int n FROM products')).rows[0].n,1);
});
test('consumed units cannot return through repeated or pre-dispatch feed snapshots',async()=>{
 const f=await fixture();await f.sync.apply(parseStockFeed(xml(f.at,2)));await f.checkout.create(f.body);
 await f.checkout.placed({session_id:f.body.session_id,order_id:'external',order_number:12,payment_method:'online',acquiring_id:'paid'});
 await new YcpOrders(f.db,f.settings,undefined,true).delivered({order_id:'external'},{purchased_items:[{id:'SKU-1',quantity:1}]});
 assert.equal(await f.available(),1);await f.sync.apply(parseStockFeed(xml(f.at,2)));assert.equal(await f.available(),1);
 await f.sync.apply(parseStockFeed(xml(new Date(+f.at+1000),2)));assert.equal(await f.available(),1);
});
test('Yandex feed and checkout link share external availability and stock sync rolls back atomically',async()=>{
 const f=await fixture();await f.sync.apply(parseStockFeed(xml(f.at,2)));
 const yandex=new YandexFeed(f.db,{...f.settings,feed:{name:'ASAYA',company:'ASAYA'},button:{enabled:true}},undefined,true);
 await yandex.prepare(true);assert.equal((await yandex.render()).items[0]!.available,2);
 await assert.rejects(yandex.checkoutLink({items:[{sku:'SKU-1',quantity:3}]}),/INSUFFICIENT_STOCK/);
 await f.db.pool.query("CREATE FUNCTION reject_stock_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='stock.source_synced' THEN RAISE EXCEPTION 'test'; END IF; RETURN NEW; END; $$; CREATE TRIGGER reject_stock_audit BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION reject_stock_audit()");
 try{await assert.rejects(f.sync.apply(parseStockFeed(xml(new Date(+f.at+1000),10))));assert.equal(await f.available(),2);}
 finally{await f.db.pool.query('DROP TRIGGER reject_stock_audit ON audit_log; DROP FUNCTION reject_stock_audit()');}
 await f.db.pool.query("UPDATE stock_sources SET expires_at=now()-interval '1 second'");assert.equal((await yandex.render()).included,0);await assert.rejects(yandex.checkoutLink({items:[{sku:'SKU-1',quantity:1}]}),/PRODUCT_UNAVAILABLE/);
});


test('published storefront remains visible through missing, zero, positive and stale stock without republishing',async()=>{
 const f=await fixture(),catalog=new CommerceService(f.db,undefined,'production');
 const published=await f.db.pool.query('SELECT published,revision,published_at FROM product_editor WHERE product_id=$1',[f.product]);
 const check=async(quantity:number)=>{const items=await catalog.catalog();assert.equal(items.length,1);assert.equal(items[0]!.sku,'SKU-1');assert.equal(items[0]!.available,quantity);assert.equal(items[0]!.content.image,content.image);};
 await check(0); // No stock source yet is not an unpublished product.
 for(const [index,quantity] of [0,5,0].entries()){
  await f.sync.apply(parseStockFeed(xml(new Date(+f.at+index*1000),quantity)));
  await check(quantity);
  assert.deepEqual((await f.db.pool.query('SELECT published,revision,published_at FROM product_editor WHERE product_id=$1',[f.product])).rows,published.rows);
 }
 await f.sync.apply(parseStockFeed(xml(new Date(+f.at+3000),5)));await check(5);
 await f.db.pool.query("UPDATE stock_sources SET expires_at=now()-interval '1 second'");await check(0);
 await f.db.pool.query('UPDATE stock_sources SET healthy=false');await check(0);
 await f.db.pool.query("UPDATE stock_sources SET healthy=true,expires_at=now()+interval '1 hour'");await check(5);
 await f.db.pool.query('UPDATE product_editor SET published=NULL WHERE product_id=$1',[f.product]);
 assert.equal((await catalog.catalog()).length,0);
 await f.db.pool.query('UPDATE product_editor SET published=$2 WHERE product_id=$1',[f.product,JSON.stringify(published.rows[0].published)]);
 await f.db.pool.query('UPDATE products SET active=false WHERE id=$1',[f.product]);assert.equal((await catalog.catalog()).length,0);
});

test('cart catalog distinguishes confirmed zero from missing, stale and failed stock using the shared source',async()=>{
 const f=await fixture(),catalog=new CommerceService(f.db,undefined,'production');
 const check=async(available:number,stockState:string)=>{
  const [item]=await catalog.catalog();assert.equal(item!.available,available);assert.equal(item!.stockState,stockState);
  const basket=await f.basket.basket(f.request);
  assert.equal(basket.items[0]!.warehouses.reduce((sum:number,w:{available_quantity:number})=>sum+w.available_quantity,0),available);
 };
 await check(0,'unknown');
 await f.sync.apply(parseStockFeed(xml(f.at,0)));await check(0,'known');
 await f.sync.apply(parseStockFeed(xml(new Date(+f.at+1000),5)));await check(5,'known');
 await f.db.pool.query("UPDATE stock_sources SET expires_at=now()-interval '1 second'");await check(0,'unknown');
 await f.db.pool.query("UPDATE stock_sources SET expires_at=now()+interval '1 hour',healthy=false");await check(0,'unknown');
 await f.db.pool.query('UPDATE stock_sources SET healthy=true');await check(5,'known');
 await f.sync.apply(parseStockFeed(xml(new Date(+f.at+2000),5).replace(/<offer [\s\S]*<\/offer>/,'')));await check(0,'unknown');
 await f.sync.apply(parseStockFeed(xml(new Date(+f.at+3000),0)));await check(0,'known');
});

test('production YCP HTTP basket follows the official contract and preserves unknown stock diagnostics without provider calls',async()=>{
 const f=await fixture(),url='/api/v1/checkout/basket/check',headers={authorization:'Bearer '+token};
 const app=await buildApp({db:f.db,deploymentMode:'ycp',origin:'https://asaya.example.test',secureCookies:true,
  staffSecret:'s'.repeat(32),otpSecret:'o'.repeat(32),otpSender:new DisabledOtpSender(),stock:f.sync,ycp:{token,settings:f.settings}});
 const originalFetch=globalThis.fetch;let outbound=0;
 globalThis.fetch=async()=>{outbound++;throw new Error('Basket must use local synchronized stock only');};
 const check=async(quantity:number,allowed:number,known:boolean,providerQuantity:number|null,syncStatus:string)=>{
  const balances=(await f.db.pool.query('SELECT * FROM inventory_balances ORDER BY warehouse_id')).rows;
  const request={...f.request,items:[{id:'SKU-1',quantity}]};
  for(const is_health_check of [false,true]){
   const response=await app.inject({method:'POST',url,headers,payload:{...request,is_health_check}});
   assert.equal(response.statusCode,200);assert.equal(response.headers['cache-control'],'no-store');
   const body=response.json();assert.deepEqual(Object.keys(body),['items']);assert.equal(body.items.length,1);
   const item=body.items[0];
   assert.deepEqual(Object.keys(item).sort(),['id','name','regular_price','final_price','vat','img','url','warehouses','dimensions','characteristics','variations'].sort());
   assert.equal(item.id,'SKU-1');assert.equal(item.regular_price,600);assert.equal(item.final_price,500);
   assert.deepEqual(item.dimensions,{width:50,height:190,depth:50,weight:500});
   assert.equal(item.warehouses.reduce((sum:number,w:{available_quantity:number})=>sum+w.available_quantity,0),allowed);
   for(const w of item.warehouses){assert.deepEqual(Object.keys(w).sort(),['available_quantity','id']);assert.equal(w.id,f.warehouse);assert.ok(Number.isInteger(w.available_quantity));}
  }
  const storefront=(await app.inject({url:'/api/store/v1/products'})).json().items[0];
  assert.equal(storefront.available,allowed);assert.equal(storefront.stockState,known?'known':'unknown');
  const admin=await new AdminStocks(f.db,f.sync).read(f.actor,{});
  assert.equal(admin.items[0]!.quantity,providerQuantity);assert.equal(admin.source!.syncStatus,syncStatus);
  assert.deepEqual((await f.db.pool.query('SELECT * FROM inventory_balances ORDER BY warehouse_id')).rows,balances);
 };
 try{
  await check(1,0,false,null,'never_synced');
  for(const [i,[stock,requested]] of [[10,1],[1,2],[0,1]].entries()){
   await f.sync.apply(parseStockFeed(xml(new Date(+f.at+i*1000),stock!)));
   await check(requested!,stock!,true,stock!,'fresh');
  }
  await f.sync.apply(parseStockFeed(xml(new Date(+f.at+3000),10)));
  await f.db.pool.query("UPDATE stock_sources SET expires_at=now()-interval '1 second'");await check(1,0,false,10,'stale');
  await f.db.pool.query("UPDATE stock_sources SET expires_at=now()+interval '1 hour',healthy=false");await check(1,0,false,10,'error');
  await f.sync.apply(parseStockFeed(xml(new Date(+f.at+4000),10).replaceAll('SKU-1','OTHER-SKU')));await check(1,0,false,null,'fresh');
  await f.sync.apply(parseStockFeed(xml(new Date(+f.at+5000),10)));await check(100,10,true,10,'fresh');
  await f.db.pool.query('UPDATE inventory_balances SET reserved=3 WHERE product_id=$1',[f.product]);
  await check(100,7,true,10,'fresh'); // Admin retains provider count; YCP excludes reservations.
  await f.db.pool.query('UPDATE product_prices SET final_minor=49900 WHERE product_id=$1',[f.product]);
  assert.equal((await app.inject({method:'POST',url,headers,payload:f.request})).json().items[0].final_price,499);
  for(const item of [{id:'SKU-1',quantity:1,final_price:1},{id:'SKU-1',quantity:1,available_quantity:999},{id:'SKU-1',quantity:1.5},{id:'SKU-1',quantity:0}]){
   assert.equal((await app.inject({method:'POST',url,headers,payload:{...f.request,items:[item]}})).statusCode,400);
  }
  assert.equal((await app.inject({method:'POST',url,payload:f.request})).statusCode,401);
  assert.equal((await app.inject({method:'POST',url,headers,payload:{...f.request,items:[{id:'unknown',quantity:1}]}})).statusCode,404);
  for(const table of ['orders','checkout_sessions','integration_inbox','integration_outbox','inventory_reservations'])assert.equal((await f.db.pool.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n,0);
  assert.equal(outbound,0);
 }finally{globalThis.fetch=originalFetch;await app.close();}
});
