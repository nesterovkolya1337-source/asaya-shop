import {test,before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {testDatabase} from './postgres.js';
import {CdekStockFeed,parseStockFeed,stockSettingsSchema} from '../src/cdek-stock-feed.js';
import {StockSync} from '../src/stock-sync.js';
import {YcpCatalog,type YcpSettings} from '../src/ycp-catalog.js';
import {YcpCheckout} from '../src/ycp-checkout.js';
import {CommerceService} from '../src/commerce.js';
import {AdminCatalog} from '../src/admin-catalog.js';
import {YcpOrders} from '../src/ycp-orders.js';
import {YandexFeed} from '../src/yandex-feed.js';
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
 const body={session_id:'session-1',warehouse_id:warehouse,items:[{id:'SKU-1',quantity:1,regular_price:60000,final_price:50000}],customer:{full_name:'Test',phone:'+79990000000',email:'buyer@example.test'},delivery:{delivery_method:'courier',service_type:'cdek',price:100,address:{locality:'Москва',address:'Test'},delivery_date_interval:{start_interval:{date:'2026-10-01'},end_interval:{date:'2026-10-02'},time_zone:3}}};
 const available=async()=>(await basket.basket(request)).items[0]!.warehouses[0].available_quantity;
 return {db,warehouse,product,actor,at,source,sync,settings,basket,checkout,request,body,available};
}
test('FF parser accepts exact article/count contract and rejects unsafe or ambiguous XML',()=>{
 const at=new Date('2026-09-17T00:00:00Z');assert.deepEqual(parseStockFeed(xml(at,4)).items,[{sku:'SKU-1',quantity:4}]);
 for(const bad of [xml(at,-1),xml(at,1.5),xml(at,1000001),xml(at,1).replace('<count>1</count>',''),xml(at,1).replace('code="article"','code="barcode"'),xml(at,1).replace('id="SKU-1"','id="different"'),xml(at,1).replace('</offers>','<offer id="SKU-1"><param code="article">SKU-1</param><count>1</count></offer></offers>'),xml(at,1).replace('</offer>','<count>2</count></offer>'),xml(at,1).replace('</shop>',''),xml(at,1).replace('<shop>','<!DOCTYPE evil [<!ENTITY x SYSTEM "file:///secret">]><shop>'),'<html/>'])assert.throws(()=>parseStockFeed(bad),/STOCK_FEED_INVALID/);
 for(const url of ['http://static.integrations.ffcdek.ru/a.xml','https://evil.test/a.xml',feedUrl+'?token=x',feedUrl.replace('https://','https://user@')])assert.equal(stockSettingsSchema.safeParse({warehouseId:randomUUID(),accountId:'a',externalWarehouseId:'1',environment:'test',feedUrl:url}).success,false);
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
 const failing=new StockSync(f.db,new CdekStockFeed(f.source.settings,async()=>{throw new Error('private URL');}));await assert.rejects(failing.refresh(),/STOCK_REFRESH_FAILED/);assert.equal(await f.available(),0);
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
