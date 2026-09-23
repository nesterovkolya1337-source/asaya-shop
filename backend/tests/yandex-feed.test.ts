import {before,after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {SaxesParser} from 'saxes';
import {testDatabase} from './postgres.js';
import {YandexFeed,xmlText} from '../src/yandex-feed.js';
import {YcpCatalog,type YcpSettings} from '../src/ycp-catalog.js';
import {emptyContent} from '../src/admin-catalog.js';
import {buildApp} from '../src/app.js';
import {DisabledOtpSender} from '../src/auth.js';
let ctx:Awaited<ReturnType<typeof testDatabase>>;
const token='yandex-feed-test-token-with-at-least-32-characters';
before(async()=>{ctx=await testDatabase();});after(async()=>{await ctx?.stop();});
beforeEach(async()=>{await ctx.db.pool.query('TRUNCATE yandex_checkout_attempts,products,warehouses,users,checkout_sessions,integration_inbox,integration_outbox CASCADE');});
async function fixture(){
 const db=ctx.db,product=randomUUID(),warehouse=randomUUID();
 await db.pool.query("INSERT INTO warehouses(id,code,name,active) VALUES($1,'FEED','Test warehouse',true)",[warehouse]);
 await db.pool.query('INSERT INTO products(id,sku,name,active,sale_approved,weight_g,width_mm,height_mm,depth_mm) VALUES($1,$2,$3,true,true,505,61,192,42)',[product,'SKU-FEED','Гель ASAYA & «Киви» <500 мл>']);
 await db.pool.query("INSERT INTO product_prices(product_id,currency,regular_minor,final_minor,approved) VALUES($1,'RUB',60000,50001,true)",[product]);
 await db.pool.query('INSERT INTO inventory_balances(product_id,warehouse_id,on_hand,reserved) VALUES($1,$2,10,3)',[product,warehouse]);
 await db.pool.query("INSERT INTO storefront_mappings(slug,product_id,approved,confidence,reason) VALUES('feed-gel',$1,true,'high','test')",[product]);
 const content={...emptyContent,description:'Описание & текст <без HTML> ]]> "цитата"',category:'body',image:'/images/test-gel.webp'};
 await db.pool.query('INSERT INTO product_editor(product_id,revision,draft,published) VALUES($1,1,$2,$3)',[product,JSON.stringify({content:{...content,description:'PRIVATE DRAFT'}}),JSON.stringify({content})]);
 const settings:YcpSettings={accountId:'feed-test',environment:'test',publicOrigin:'https://asaya.example.test',priceUnit:'minor',vat:0,feed:{name:'ASAYA',company:'ТЕСТОВАЯ компания & партнёры'},warehouses:[{warehouseId:warehouse,address:'PRIVATE warehouse address',phone:'+79990000000',servedLocalities:['Москва'],ycpDeliveryEnabled:false}]};
 return {db,product,warehouse,content,settings,feed:new YandexFeed(db,settings,()=>new Date('2026-09-07T00:00:00Z'))};
}

test('checkout link uses current server prices and canonical SKUs in UTF-8 without creating an order or reserve',async()=>{
 const f=await fixture();await f.feed.prepare(true);
 await f.db.pool.query("UPDATE product_external_ids SET external_id='Киви/500'");
 const service=new YandexFeed(f.db,{...f.settings,checkout:{deliveryPriceUnit:'rubles'},button:{enabled:true}});
 const result=await service.checkoutLink({items:[{sku:'SKU-FEED',quantity:2}]}),url=new URL(result.url);
 assert.equal(url.origin,'https://checkout.kit.yandex.ru');assert.equal(url.pathname,'/express');assert.equal(url.searchParams.get('host'),'asaya.example.test');
 assert.deepEqual(JSON.parse(Buffer.from(url.searchParams.get('data')!,'base64').toString('utf8')),{items:[{id:'SKU-FEED',quantity:2,price:600,final_price:475}]});
 assert.equal((await f.db.pool.query('SELECT reserved FROM inventory_balances')).rows[0].reserved,3);
 assert.equal((await f.db.pool.query('SELECT 1 FROM orders')).rowCount,0);assert.ok(!result.url.includes(token));
 await f.db.pool.query('UPDATE product_prices SET final_minor=51002');
 const next=new URL((await service.checkoutLink({items:[{sku:'SKU-FEED',quantity:1}]})).url);
 assert.equal(JSON.parse(Buffer.from(next.searchParams.get('data')!,'base64').toString()).items[0].final_price,510.02);
});

test('checkout link rejects tampered input, unavailable goods and excess stock independently of feed mappings',async()=>{
 const f=await fixture();await f.feed.prepare(true);
 const service=new YandexFeed(f.db,{...f.settings,checkout:{deliveryPriceUnit:'rubles'},button:{enabled:true}});
 for(const payload of [{items:[]},{items:[{sku:'SKU-FEED',quantity:0}]},{items:[{sku:'SKU-FEED',quantity:1,price:1}]},{items:[{sku:'SKU-FEED',quantity:1}],host:'evil.test'},{items:[{sku:'SKU-FEED',quantity:1},{sku:'SKU-FEED',quantity:1}]}])await assert.rejects(service.checkoutLink(payload));
 await assert.rejects(service.checkoutLink({items:[{sku:'SKU-FEED',quantity:8}]}),/INSUFFICIENT_STOCK/);
 await assert.rejects(service.checkoutLink({items:[{sku:'missing',quantity:1}]}),/PRODUCT_UNAVAILABLE/);
 await f.db.pool.query('UPDATE products SET active=false');await assert.rejects(service.checkoutLink({items:[{sku:'SKU-FEED',quantity:1}]}),/PRODUCT_UNAVAILABLE/);
 await f.db.pool.query('UPDATE products SET active=true');
 await f.db.pool.query("INSERT INTO product_external_ids(provider,environment,account_id,external_id,product_id) VALUES('ycp','test','feed-test','duplicate',$1)",[f.product]);
 assert.ok((await service.checkoutLink({items:[{sku:'SKU-FEED',quantity:1}]})).url);
});

test('checkout link HTTP requires same origin and explicit settings but no local customer login',async()=>{
 const f=await fixture();await f.feed.prepare(true);
 const origin='http://127.0.0.1:3200',options={db:f.db,otpSecret:token,otpSender:new DisabledOtpSender(),origin,secureCookies:false};
 const url='/api/store/v1/yandex/checkout-link',payload={items:[{sku:'SKU-FEED',quantity:1}]};
 const app=await buildApp({...options,ycp:{token,settings:{...f.settings,checkout:{deliveryPriceUnit:'rubles'},button:{enabled:true}}}});
 try{
  assert.equal((await app.inject({method:'POST',url,payload})).statusCode,403);
  assert.equal((await app.inject({method:'POST',url,payload,headers:{origin:'https://evil.test'}})).statusCode,403);
  assert.equal((await app.inject({method:'POST',url,payload,headers:{origin}})).statusCode,400);
  assert.equal((await app.inject({method:'POST',url,payload,headers:{origin,'idempotency-key':'bad'}})).statusCode,400);
  const response=await app.inject({method:'POST',url,payload,headers:{origin,'idempotency-key':randomUUID()}});assert.equal(response.statusCode,200);assert.equal(response.headers['cache-control'],'no-store');assert.ok(response.json().url);assert.equal(response.headers['set-cookie'],undefined);
 }finally{await app.close();}
 for(const settings of [f.settings,{...f.settings,button:{enabled:false}}]){
  const disabled=await buildApp({...options,ycp:{token,settings}});
  try{assert.equal((await disabled.inject({method:'POST',url,payload,headers:{origin,'idempotency-key':randomUUID()}})).statusCode,503);}finally{await disabled.close();}
 }
});
test('feed prepares stable offer IDs only explicitly and preserves identity through concurrent replay',async()=>{
 const f=await fixture(),plan=await f.feed.prepare();assert.equal(plan.items[0]!.action,'would_create');assert.equal((await f.db.pool.query('SELECT 1 FROM product_external_ids')).rowCount,0);
 await Promise.all(Array.from({length:4},()=>f.feed.prepare(true)));
 assert.equal((await f.db.pool.query('SELECT 1 FROM product_external_ids')).rowCount,1);assert.equal((await f.db.pool.query("SELECT 1 FROM audit_log WHERE action='ycp.feed_mapping.created'")).rowCount,1);
 const offer=plan.items[0]!.offerId;assert.equal(offer,`asaya-${f.product}`);assert.equal((await f.feed.prepare(true)).items[0]!.offerId,offer);
 await f.db.pool.query('UPDATE product_prices SET final_minor=50000');
 const checked=await new YcpCatalog(f.db,token,f.settings).basket({items:[{id:offer,quantity:1}],offers_id_from_merchant_center:true,locality:'Москва',is_health_check:true});assert.equal(checked.items[0]!.id,'SKU-FEED');assert.equal(checked.items[0]!.final_price,500);
 assert.equal((await f.db.pool.query('SELECT reserved FROM inventory_balances')).rows[0].reserved,3);
});
test('feed uses published fields, precise rubles and YML units, escaping XML with canonical checkout eligibility',async()=>{
 const f=await fixture();await f.feed.prepare(true);const result=await f.feed.render();assert.equal(result.included,1);assert.deepEqual(result.skipped,[]);
 assert.match(result.xml,/<price>500\.01<\/price>/);assert.match(result.xml,/<oldprice>600<\/oldprice>/);assert.match(result.xml,/<currencyId>RUR<\/currencyId>/);
 assert.match(result.xml,/<weight>0\.505<\/weight>/);assert.match(result.xml,/<dimensions>4\.2\/6\.1\/19\.2<\/dimensions>/);assert.match(result.xml,/<param name="is_checkout_enabled">true<\/param>/);
 assert.ok(result.xml.includes('Гель ASAYA &amp; «Киви» &lt;500 мл&gt;'));assert.ok(result.xml.includes(']]&gt;'));assert.ok(!result.xml.includes('PRIVATE'));assert.ok(!result.xml.includes(token));
 assert.ok(result.xml.includes('https://asaya.example.test/product/feed-gel/'));assert.ok(result.xml.includes('https://asaya.example.test/images/test-gel.webp'));
 if(process.env.ASAYA_FEED_TEST_OUTPUT)await writeFile(process.env.ASAYA_FEED_TEST_OUTPUT,result.xml,{encoding:'utf8',flag:'wx'});
 await f.db.pool.query('UPDATE product_prices SET regular_minor=60001');assert.ok(!(await f.feed.render()).xml.includes('<oldprice>'));
});
test('feed keeps zero stock and missing dimensions, rejects invalid required content explicitly',async()=>{
 const f=await fixture();let r=await f.feed.render();assert.equal(r.included,1);assert.match(r.xml,/<offer id="SKU-FEED" available="false"/);
 await f.db.pool.query('UPDATE inventory_balances SET reserved=on_hand');assert.equal((await f.feed.render()).included,1);
 await f.db.pool.query('UPDATE products SET weight_g=NULL,width_mm=NULL');r=await f.feed.render();assert.ok(!r.xml.includes('<weight>'));assert.ok(!r.xml.includes('<dimensions>'));
 await f.db.pool.query('UPDATE product_editor SET published=$1',[JSON.stringify({content:{...f.content,image:'/images/vector.svg'}})]);await assert.rejects(f.feed.render(),/YANDEX_FEED_VALIDATION_FAILED/);
});

test('feed excludes hidden, archived, drafts and unapproved prices but includes sets as canonical offers',async()=>{
 const f=await fixture();
 for(const [table,field] of [['products','active'],['product_prices','approved'],['storefront_mappings','approved']]){await f.db.pool.query(`UPDATE ${table} SET ${field}=false`);assert.equal((await f.feed.render()).included,0);await f.db.pool.query(`UPDATE ${table} SET ${field}=true`);}
 await f.db.pool.query('UPDATE products SET sale_approved=false');assert.match((await f.feed.render()).xml,/<param name="is_checkout_enabled">false/);await f.db.pool.query('UPDATE products SET sale_approved=true');
 assert.equal((await new YandexFeed(f.db,{...f.settings,warehouses:[]}).render()).included,1);
 const component=randomUUID();await f.db.pool.query("INSERT INTO products(id,sku,name) VALUES($1,'COMPONENT','Hidden component')",[component]);await f.db.pool.query('INSERT INTO product_components(product_id,component_id,quantity) VALUES($1,$2,1)',[f.product,component]);assert.equal((await f.feed.render()).included,1);assert.match((await f.feed.render()).xml,/<param name="is_checkout_enabled">false/);
 await f.db.pool.query("UPDATE products SET archived_at=now() WHERE id=$1",[f.product]);assert.equal((await f.feed.render()).included,0);await f.db.pool.query('UPDATE products SET archived_at=NULL');
 await f.db.pool.query('UPDATE product_editor SET published=NULL');assert.equal((await f.feed.render()).included,0);
});

test('feed ignores legacy mappings, uses unique canonical SKUs and parses as valid XML',async()=>{
 const f=await fixture();await f.db.pool.query("INSERT INTO product_external_ids(provider,environment,account_id,external_id,product_id) VALUES('ycp','test','feed-test','old-offer',$1)",[f.product]);
 const result=await f.feed.render();assert.match(result.xml,/<offer id="SKU-FEED"/);assert.ok(!result.xml.includes('old-offer'));
 assert.equal((await new YandexFeed(f.db,{...f.settings,accountId:'other'}).render()).included,1);
 const parser=new SaxesParser();let count=0;parser.on('opentag',tag=>{if(tag.name==='offer')count++;});parser.write(result.xml).close();assert.equal(count,1);
 assert.equal(xmlText('А & < > " \' \u0001 😀 \ud800'),'А &amp; &lt; &gt; &quot; &apos;  😀 ');
 await f.db.pool.query("UPDATE products SET sku='bad id'");await assert.rejects(f.feed.render(),/YANDEX_FEED_VALIDATION_FAILED/);
});

test('feed real-stock availability respects snapshot freshness/health and never falls back to inventory',async()=>{
 const f=await fixture();
 await f.db.pool.query("INSERT INTO stock_sources(warehouse_id,source_kind,environment,source_hash,payload_hash,generated_at,fetched_at,expires_at,healthy) VALUES($1,'cdek_ff_api','production',repeat('a',64),'fixture',now(),now(),now()+interval '10 minutes',true)",[f.warehouse]);
 await f.db.pool.query('INSERT INTO stock_source_items(warehouse_id,product_id,provider_quantity,quantity,listed) VALUES($1,$2,10,10,true)',[f.warehouse,f.product]);
 assert.match((await f.feed.render()).xml,/available="true"/);
 for(const sql of ["UPDATE stock_sources SET healthy=false","UPDATE stock_sources SET healthy=true,expires_at=now()-interval '1 minute'"]){await f.db.pool.query(sql);const r=await f.feed.render();assert.equal(r.included,1);assert.match(r.xml,/available="false"/);}
});

test('representative Hair, Body and Set offers reference declared stable categories and current canonical one-unit prices',async()=>{
 const f=await fixture();
 for(const [sku,category] of [['HAIR-1','hair'],['SET-1','sets']]){
  const id=randomUUID();await f.db.pool.query('INSERT INTO products(id,sku,name,active,sale_approved) VALUES($1,$2,$2,true,true)',[id,sku]);
  await f.db.pool.query("INSERT INTO product_prices(product_id,currency,regular_minor,final_minor,approved) VALUES($1,'RUB',79900,79900,true)",[id]);
  await f.db.pool.query("INSERT INTO storefront_mappings(slug,product_id,approved,confidence,reason) VALUES($1,$2,true,'high','fixture')",[sku!.toLowerCase(),id]);
  await f.db.pool.query("INSERT INTO product_editor(product_id,revision,draft,published) VALUES($1,1,'{}',$2)",[id,{content:{...f.content,category}}]);
 }
 const result=await f.feed.render(),categories=new Set<string>(),references:string[]=[],parser=new SaxesParser();let element='';
 parser.on('opentag',t=>{element=t.name;if(t.name==='category')categories.add(String(t.attributes.id));});parser.on('text',t=>{if(element==='categoryId')references.push(t);});parser.write(result.xml).close();
 assert.equal(result.included,3);assert.deepEqual(references.sort(),['1','2','4']);assert.ok(references.every(id=>categories.has(id)));
 assert.match(result.xml,/<price>799\.00<\/price>/);
 if(process.env.ASAYA_FEED_SAMPLE)await writeFile(process.env.ASAYA_FEED_SAMPLE,result.xml,'utf8');
 await f.db.pool.query("UPDATE product_prices SET final_minor=75000 WHERE product_id=(SELECT id FROM products WHERE sku='HAIR-1')");assert.equal((await f.feed.render()).items.find(i=>i.sku==='HAIR-1')!.finalMinor,75000);
});

test('feed HTTP is public only when configured, never writes mappings, and exposes no credentials or private fields',async()=>{
 const f=await fixture(),options={db:f.db,otpSecret:token,otpSender:new DisabledOtpSender(),origin:'http://127.0.0.1:3200',secureCookies:false},url='/api/store/v1/yandex/feed.xml';
 const app=await buildApp({...options,ycp:{token,settings:f.settings}});
 try{
  let r=await app.inject({url});assert.equal(r.statusCode,200);assert.match(String(r.headers['content-type']),/application\/xml/);assert.equal(r.headers['cache-control'],'no-store');assert.ok(!r.body.includes('MISSING_OFFER_ID'));assert.equal((await f.db.pool.query('SELECT 1 FROM product_external_ids')).rowCount,0);
  await f.feed.prepare(true);r=await app.inject({url});assert.ok(r.body.includes('<offer id='));assert.ok(!r.body.includes('PRIVATE'));assert.ok(!r.body.includes(token));assert.ok(!r.body.includes(f.settings.accountId));
  assert.equal((await app.inject({method:'POST',url:'/api/ycp/v1/checkout/basket/check',payload:{}})).statusCode,401);
 }finally{await app.close();}
 const disabled=await buildApp({...options,ycp:{token,settings:{...f.settings,feed:undefined}}});try{assert.equal((await disabled.inject({url})).statusCode,200);}finally{await disabled.close();}
});

test('redirect attempts commit one snapshot under retry, isolate accounts and reject changed or expired requests',async()=>{
 const f=await fixture();await f.feed.prepare(true);let now=new Date('2026-09-07T00:00:00Z');
 const service=new YandexFeed(f.db,{...f.settings,checkout:{deliveryPriceUnit:'rubles'},button:{enabled:true}},()=>now);
 const key=randomUUID(),body={items:[{sku:'SKU-FEED',quantity:2}]};
 const results=await Promise.all(Array.from({length:6},()=>service.checkoutLink(body,key)));
 assert.ok(results.every(r=>r.url===results[0]!.url));
 const rows=(await f.db.pool.query('SELECT * FROM yandex_checkout_attempts')).rows;assert.equal(rows.length,1);
 assert.deepEqual(rows[0].request_snapshot,body);assert.equal(rows[0].checkout_snapshot.items[0].final_price,475);
 assert.equal(rows[0].redirect_url,results[0]!.url);assert.equal(new Date(rows[0].expires_at).getTime()-now.getTime(),3600000);
 assert.equal((await f.db.pool.query('SELECT 1 FROM orders')).rowCount,0);
 await assert.rejects(service.checkoutLink({items:[{sku:'SKU-FEED',quantity:1}]},key),/CHECKOUT_ATTEMPT_CONFLICT/);
 await f.db.pool.query('UPDATE product_prices SET final_minor=51002');await assert.rejects(service.checkoutLink(body,key),/CHECKOUT_ATTEMPT_CONFLICT/);
 await f.db.pool.query('UPDATE product_prices SET final_minor=50001');
 const other=new YandexFeed(f.db,{...f.settings,accountId:'another',checkout:{deliveryPriceUnit:'rubles'},button:{enabled:true}},()=>now);await other.prepare(true);await other.checkoutLink(body,key);
 assert.equal((await f.db.pool.query('SELECT 1 FROM yandex_checkout_attempts')).rowCount,2);
 now=new Date(now.getTime()+3600000);await assert.rejects(service.checkoutLink(body,key),/CHECKOUT_ATTEMPT_CONFLICT/);
 assert.equal((await f.db.pool.query('SELECT reserved FROM inventory_balances')).rows[0].reserved,3);
});
test('redirect is withheld if attempt persistence fails and invalid keys create no attempt',async()=>{
 const f=await fixture();await f.feed.prepare(true);const service=new YandexFeed(f.db,{...f.settings,checkout:{deliveryPriceUnit:'rubles'},button:{enabled:true}}),body={items:[{sku:'SKU-FEED',quantity:1}]};
 await assert.rejects(service.checkoutLink(body,'bad'));
 await f.db.pool.query(`CREATE FUNCTION reject_attempt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test storage failure'; END $$`);
 await f.db.pool.query('CREATE TRIGGER reject_attempt BEFORE INSERT ON yandex_checkout_attempts FOR EACH ROW EXECUTE FUNCTION reject_attempt()');
 try{await assert.rejects(service.checkoutLink(body),/test storage failure/);assert.equal((await f.db.pool.query('SELECT 1 FROM yandex_checkout_attempts')).rowCount,0);}
 finally{await f.db.pool.query('DROP TRIGGER reject_attempt ON yandex_checkout_attempts');await f.db.pool.query('DROP FUNCTION reject_attempt()');}
});
import {StorefrontControls} from '../src/storefront-controls.js';
import {CommerceService} from '../src/commerce.js';
test('test stock launches express only; YCP, feed, balances, reserves and orders use real stock exclusively',async()=>{
 const f=await fixture(),actor=randomUUID();await f.feed.prepare(true);await f.db.pool.query("INSERT INTO users(id,role) VALUES($1,'admin')",[actor]);await f.db.pool.query('UPDATE inventory_balances SET on_hand=0,reserved=0');
 await f.db.pool.query('UPDATE product_prices SET final_minor=50000');
 const c=new StorefrontControls(f.db,false),service=new YandexFeed(f.db,{...f.settings,checkout:{deliveryPriceUnit:'rubles'},button:{enabled:false}}),body={items:[{sku:'SKU-FEED',quantity:5}]};
 await assert.rejects(service.checkoutLink(body),/YANDEX_CHECKOUT_UNAVAILABLE/);
 const ycp=new YcpCatalog(f.db,token,f.settings),request={items:[{id:'SKU-FEED',quantity:5}],offers_id_from_merchant_center:false,locality:'Москва',is_health_check:false};
 const real=await ycp.basket(request),balance=(await f.db.pool.query('SELECT * FROM inventory_balances')).rows;
 await c.saveStock(actor,f.product,{enabled:true,quantity:5,revision:0});
 assert.equal((await new CommerceService(f.db).catalog(true))[0]!.available,5);
 const {url}=await service.checkoutLink(body),data=JSON.parse(Buffer.from(new URL(url).searchParams.get('data')!,'base64').toString());
 assert.deepEqual(Object.keys(data.items[0]).sort(),['final_price','id','price','quantity']);assert.equal(data.items[0].quantity,5);
 assert.deepEqual(await ycp.basket(request),real);assert.match((await f.feed.render()).xml,/available="false"/);
 assert.deepEqual((await f.db.pool.query('SELECT * FROM inventory_balances')).rows,balance);
 for(const table of ['orders','inventory_reservations','integration_outbox'])assert.equal((await f.db.pool.query('SELECT 1 FROM '+table)).rowCount,0);
 await assert.rejects(service.checkoutLink({items:[{sku:'SKU-FEED',quantity:6}]}));
 await c.saveStock(actor,f.product,{enabled:false,quantity:5,revision:1});assert.equal((await new CommerceService(f.db).catalog(true))[0]!.available,0);await assert.rejects(service.checkoutLink(body),/YANDEX_CHECKOUT_UNAVAILABLE/);
});

// Production-shaped configuration: no feed, no mappings, no VAT/monetary switches.
test('custom-site SKU checkout and authenticated basket work without feed or legacy settings; test stock never reaches YCP',async()=>{
 const f=await fixture(),actor=randomUUID();
 await f.db.pool.query("INSERT INTO users(id,role) VALUES($1,'admin')",[actor]);
 await f.db.pool.query('UPDATE inventory_balances SET on_hand=0,reserved=0');
 await f.db.pool.query('UPDATE products SET weight_g=NULL,width_mm=NULL,height_mm=NULL,depth_mm=NULL');
 await f.db.pool.query('UPDATE product_prices SET final_minor=50000');
 const {priceUnit,vat,feed,checkout,...settings}=f.settings;
 const before=(await f.db.pool.query('SELECT * FROM inventory_balances ORDER BY warehouse_id')).rows;
 const prices=(await f.db.pool.query('SELECT * FROM product_prices')).rows;
 const controls=new StorefrontControls(f.db,false);
 await controls.saveStock(actor,f.product,{enabled:true,quantity:3,revision:0});
 assert.equal((await new CommerceService(f.db).catalog(true))[0]!.available,3);
 const origin='https://asaya.example.test';
 const app=await buildApp({db:f.db,otpSecret:token,otpSender:new DisabledOtpSender(),origin,secureCookies:true,ycp:{token,settings}});
 try{
  const response=await app.inject({method:'POST',url:'/api/store/v1/yandex/checkout-link',headers:{origin,'idempotency-key':randomUUID()},payload:{items:[{sku:'SKU-FEED',quantity:3}]}});
  assert.equal(response.statusCode,200,response.body);
  const url=new URL(response.json().url);assert.equal(url.origin,'https://checkout.kit.yandex.ru');assert.equal(url.pathname,'/express');
  assert.deepEqual(JSON.parse(Buffer.from(url.searchParams.get('data')!,'base64').toString()),{items:[{id:'SKU-FEED',quantity:3,price:600,final_price:450}]});
  for(const offers_id_from_merchant_center of [true,false]){
   const r=await app.inject({method:'POST',url:'/api/v1/checkout/basket/check',headers:{authorization:'Bearer '+token},payload:{items:[{id:'SKU-FEED',quantity:3}],offers_id_from_merchant_center,locality:'Москва',is_health_check:false}});
   assert.equal(r.statusCode,200,r.body);const item=r.json().items[0];
   assert.equal(item.id,'SKU-FEED');assert.equal(item.regular_price,600);assert.equal(item.final_price,450);
   assert.equal(item.warehouses[0].available_quantity,0);assert.equal('vat' in item,false);assert.deepEqual(item.dimensions,{});
   if(process.env.ASAYA_CUSTOM_CHECKOUT_OUTPUT)await writeFile(process.env.ASAYA_CUSTOM_CHECKOUT_OUTPUT,JSON.stringify({basket:r.json(),checkoutUrl:response.json().url}),'utf8');
  }
  assert.equal((await f.db.pool.query('SELECT 1 FROM product_external_ids')).rowCount,0);
  for(const table of ['orders','inventory_reservations','integration_outbox'])assert.equal((await f.db.pool.query('SELECT 1 FROM '+table)).rowCount,0);
  assert.deepEqual((await f.db.pool.query('SELECT * FROM inventory_balances ORDER BY warehouse_id')).rows,before);
  assert.deepEqual((await f.db.pool.query('SELECT * FROM product_prices')).rows,prices);
 }finally{await app.close();}
});
