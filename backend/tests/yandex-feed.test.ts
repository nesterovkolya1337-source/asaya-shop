import {before,after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
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

test('checkout link uses current server prices and scoped feed IDs in UTF-8 without creating an order or reserve',async()=>{
 const f=await fixture();await f.feed.prepare(true);
 await f.db.pool.query("UPDATE product_external_ids SET external_id='Киви/500'");
 const service=new YandexFeed(f.db,{...f.settings,checkout:{deliveryPriceUnit:'rubles'},button:{enabled:true}});
 const result=await service.checkoutLink({items:[{sku:'SKU-FEED',quantity:2}]}),url=new URL(result.url);
 assert.equal(url.origin,'https://checkout.kit.yandex.ru');assert.equal(url.pathname,'/express');assert.equal(url.searchParams.get('host'),'asaya.example.test');
 assert.deepEqual(JSON.parse(Buffer.from(url.searchParams.get('data')!,'base64').toString('utf8')),{items:[{id:'Киви/500',quantity:2,price:600,final_price:500.01}]});
 assert.equal((await f.db.pool.query('SELECT reserved FROM inventory_balances')).rows[0].reserved,3);
 assert.equal((await f.db.pool.query('SELECT 1 FROM orders')).rowCount,0);assert.ok(!result.url.includes(token));
 await f.db.pool.query('UPDATE product_prices SET final_minor=51002');
 const next=new URL((await service.checkoutLink({items:[{sku:'SKU-FEED',quantity:1}]})).url);
 assert.equal(JSON.parse(Buffer.from(next.searchParams.get('data')!,'base64').toString()).items[0].final_price,510.02);
});

test('checkout link rejects tampered input, unavailable goods, ambiguous mappings and excess stock',async()=>{
 const f=await fixture();await f.feed.prepare(true);
 const service=new YandexFeed(f.db,{...f.settings,checkout:{deliveryPriceUnit:'rubles'},button:{enabled:true}});
 for(const payload of [{items:[]},{items:[{sku:'SKU-FEED',quantity:0}]},{items:[{sku:'SKU-FEED',quantity:1,price:1}]},{items:[{sku:'SKU-FEED',quantity:1}],host:'evil.test'},{items:[{sku:'SKU-FEED',quantity:1},{sku:'SKU-FEED',quantity:1}]}])await assert.rejects(service.checkoutLink(payload));
 await assert.rejects(service.checkoutLink({items:[{sku:'SKU-FEED',quantity:8}]}),/INSUFFICIENT_STOCK/);
 await assert.rejects(service.checkoutLink({items:[{sku:'missing',quantity:1}]}),/PRODUCT_UNAVAILABLE/);
 await f.db.pool.query('UPDATE products SET active=false');await assert.rejects(service.checkoutLink({items:[{sku:'SKU-FEED',quantity:1}]}),/PRODUCT_UNAVAILABLE/);
 await f.db.pool.query('UPDATE products SET active=true');
 await f.db.pool.query("INSERT INTO product_external_ids(provider,environment,account_id,external_id,product_id) VALUES('ycp','test','feed-test','duplicate',$1)",[f.product]);
 await assert.rejects(service.checkoutLink({items:[{sku:'SKU-FEED',quantity:1}]}),/PRODUCT_UNAVAILABLE/);
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
 for(const settings of [f.settings,{...f.settings,button:{enabled:true}},{...f.settings,button:{enabled:true},checkout:{deliveryPriceUnit:'rubles'},vat:null}]){
  const disabled=await buildApp({...options,ycp:{token,settings}});
  try{assert.equal((await disabled.inject({method:'POST',url,payload,headers:{origin,'idempotency-key':randomUUID()}})).statusCode,503);}finally{await disabled.close();}
 }
});
test('feed prepares stable offer IDs only explicitly and preserves identity through concurrent replay',async()=>{
 const f=await fixture(),plan=await f.feed.prepare();assert.equal(plan.items[0]!.action,'would_create');assert.equal((await f.db.pool.query('SELECT 1 FROM product_external_ids')).rowCount,0);
 await Promise.all(Array.from({length:4},()=>f.feed.prepare(true)));
 assert.equal((await f.db.pool.query('SELECT 1 FROM product_external_ids')).rowCount,1);assert.equal((await f.db.pool.query("SELECT 1 FROM audit_log WHERE action='ycp.feed_mapping.created'")).rowCount,1);
 const offer=plan.items[0]!.offerId;assert.equal(offer,`asaya-${f.product}`);assert.equal((await f.feed.prepare(true)).items[0]!.offerId,offer);
 const checked=await new YcpCatalog(f.db,token,f.settings).basket({items:[{id:offer,quantity:1}],offers_id_from_merchant_center:true,locality:'Москва',is_health_check:true});assert.equal(checked.items[0]!.id,'SKU-FEED');assert.equal(checked.items[0]!.final_price,50001);
 assert.equal((await f.db.pool.query('SELECT reserved FROM inventory_balances')).rows[0].reserved,3);
});
test('feed uses published fields, precise rubles and YML units, escaping XML without enabling checkout',async()=>{
 const f=await fixture();await f.feed.prepare(true);const result=await f.feed.render();assert.equal(result.included,1);assert.deepEqual(result.skipped,[]);
 assert.match(result.xml,/<price>500\.01<\/price>/);assert.match(result.xml,/<oldprice>600<\/oldprice>/);assert.match(result.xml,/<currencyId>RUR<\/currencyId>/);
 assert.match(result.xml,/<weight>0\.505<\/weight>/);assert.match(result.xml,/<dimensions>4\.2\/6\.1\/19\.2<\/dimensions>/);assert.match(result.xml,/<param name="is_checkout_enabled">false<\/param>/);
 assert.ok(result.xml.includes('Гель ASAYA &amp; «Киви» &lt;500 мл&gt;'));assert.ok(result.xml.includes(']]&gt;'));assert.ok(!result.xml.includes('PRIVATE'));assert.ok(!result.xml.includes(token));
 assert.ok(result.xml.includes('https://asaya.example.test/product/feed-gel/'));assert.ok(result.xml.includes('https://asaya.example.test/images/test-gel.webp'));
 if(process.env.ASAYA_FEED_TEST_OUTPUT)await writeFile(process.env.ASAYA_FEED_TEST_OUTPUT,result.xml,{encoding:'utf8',flag:'wx'});
 await f.db.pool.query('UPDATE product_prices SET regular_minor=60001');assert.ok(!(await f.feed.render()).xml.includes('<oldprice>'));
});
test('feed excludes incomplete products and unavailable stock without exposing reasons publicly',async()=>{
 const f=await fixture();let r=await f.feed.render();assert.equal(r.included,0);assert.equal(r.skipped[0]!.reason,'MISSING_OFFER_ID');await f.feed.prepare(true);
 await f.db.pool.query('UPDATE inventory_balances SET reserved=on_hand');r=await f.feed.render();assert.equal(r.included,0);assert.equal(r.skipped[0]!.reason,'OUT_OF_STOCK');assert.ok(!r.xml.includes('SKU-FEED'));
 await f.db.pool.query('UPDATE inventory_balances SET reserved=0');await f.db.pool.query('UPDATE products SET weight_g=NULL');assert.equal((await f.feed.render()).skipped[0]!.reason,'DIMENSIONS_NOT_READY');await f.db.pool.query('UPDATE products SET weight_g=505');
 await f.db.pool.query('UPDATE product_editor SET published=$1',[JSON.stringify({content:{...f.content,image:'/images/vector.svg'}})]);assert.equal((await f.feed.render()).skipped[0]!.reason,'IMAGE_NOT_READY');
 await f.db.pool.query('UPDATE product_editor SET published=$1',[JSON.stringify({content:{...f.content,description:''}})]);assert.equal((await f.feed.render()).skipped[0]!.reason,'CONTENT_NOT_READY');
});
test('feed excludes unpublished, unapproved and component-based goods and unconfigured warehouses',async()=>{
 const f=await fixture();await f.feed.prepare(true);
 for(const [table,field] of [['products','active'],['products','sale_approved'],['product_prices','approved'],['storefront_mappings','approved']]){await f.db.pool.query(`UPDATE ${table} SET ${field}=false`);assert.equal((await f.feed.render()).included,0);await f.db.pool.query(`UPDATE ${table} SET ${field}=true`);}
 assert.equal((await new YandexFeed(f.db,{...f.settings,warehouses:[]}).render()).included,0);
 await f.db.pool.query('UPDATE warehouses SET active=false');assert.equal((await f.feed.render()).included,0);await f.db.pool.query('UPDATE warehouses SET active=true');
 const component=randomUUID();await f.db.pool.query("INSERT INTO products(id,sku,name) VALUES($1,'COMPONENT','Hidden component')",[component]);await f.db.pool.query('INSERT INTO product_components(product_id,component_id,quantity) VALUES($1,$2,1)',[f.product,component]);assert.equal((await f.feed.render()).included,0);
 await f.db.pool.query('DELETE FROM product_components');await f.db.pool.query('UPDATE product_editor SET published=NULL');assert.equal((await f.feed.render()).included,0);
});
test('feed preserves existing IDs, isolates accounts, refuses ambiguous IDs and rolls back ID collisions',async()=>{
 const f=await fixture();await f.db.pool.query("INSERT INTO product_external_ids(provider,environment,account_id,external_id,product_id) VALUES('ycp','test','feed-test','old-offer',$1)",[f.product]);assert.equal((await f.feed.prepare(true)).items[0]!.offerId,'old-offer');assert.match((await f.feed.render()).xml,/<offer id="old-offer"/);
 assert.equal((await new YandexFeed(f.db,{...f.settings,accountId:'other'}).render()).included,0);
 await f.db.pool.query("INSERT INTO product_external_ids(provider,environment,account_id,external_id,product_id) VALUES('ycp','test','feed-test','second-offer',$1)",[f.product]);assert.equal((await f.feed.prepare(true)).items[0]!.action,'ambiguous');assert.equal((await f.feed.render()).skipped[0]!.reason,'AMBIGUOUS_OFFER_ID');
 await f.db.pool.query('DELETE FROM product_external_ids');const other=randomUUID();await f.db.pool.query("INSERT INTO products(id,sku,name) VALUES($1,'OTHER','Other')",[other]);await f.db.pool.query("INSERT INTO product_external_ids(provider,environment,account_id,external_id,product_id) VALUES('ycp','test','feed-test',$1,$2)",[`asaya-${f.product}`,other]);await assert.rejects(f.feed.prepare(true),/YCP_OFFER_ID_CONFLICT/);
 assert.equal((await f.db.pool.query('SELECT 1 FROM product_external_ids')).rowCount,1);
});
test('feed rejects invalid identifiers and strips invalid XML characters while preserving Unicode',async()=>{
 assert.equal(xmlText('А & < > " \' \u0001 😀 \ud800'),'А &amp; &lt; &gt; &quot; &apos;  😀 ');
 const f=await fixture();await f.feed.prepare(true);await f.db.pool.query("UPDATE product_external_ids SET external_id='bad id'");assert.equal((await f.feed.render()).skipped[0]!.reason,'INVALID_OFFER_ID');
});
test('feed HTTP is public only when configured, never writes mappings, and exposes no credentials or private fields',async()=>{
 const f=await fixture(),options={db:f.db,otpSecret:token,otpSender:new DisabledOtpSender(),origin:'http://127.0.0.1:3200',secureCookies:false},url='/api/store/v1/yandex/feed.xml';
 const app=await buildApp({...options,ycp:{token,settings:f.settings}});
 try{
  let r=await app.inject({url});assert.equal(r.statusCode,200);assert.match(String(r.headers['content-type']),/application\/xml/);assert.equal(r.headers['cache-control'],'no-store');assert.ok(!r.body.includes('MISSING_OFFER_ID'));assert.equal((await f.db.pool.query('SELECT 1 FROM product_external_ids')).rowCount,0);
  await f.feed.prepare(true);r=await app.inject({url});assert.ok(r.body.includes('<offer id='));assert.ok(!r.body.includes('PRIVATE'));assert.ok(!r.body.includes(token));assert.ok(!r.body.includes(f.settings.accountId));
  assert.equal((await app.inject({method:'POST',url:'/api/ycp/v1/checkout/basket/check',payload:{}})).statusCode,401);
 }finally{await app.close();}
 const disabled=await buildApp({...options,ycp:{token,settings:{...f.settings,feed:undefined}}});try{assert.equal((await disabled.inject({url})).statusCode,503);}finally{await disabled.close();}
});

test('redirect attempts commit one snapshot under retry, isolate accounts and reject changed or expired requests',async()=>{
 const f=await fixture();await f.feed.prepare(true);let now=new Date('2026-09-07T00:00:00Z');
 const service=new YandexFeed(f.db,{...f.settings,checkout:{deliveryPriceUnit:'rubles'},button:{enabled:true}},()=>now);
 const key=randomUUID(),body={items:[{sku:'SKU-FEED',quantity:2}]};
 const results=await Promise.all(Array.from({length:6},()=>service.checkoutLink(body,key)));
 assert.ok(results.every(r=>r.url===results[0]!.url));
 const rows=(await f.db.pool.query('SELECT * FROM yandex_checkout_attempts')).rows;assert.equal(rows.length,1);
 assert.deepEqual(rows[0].request_snapshot,body);assert.equal(rows[0].checkout_snapshot.items[0].final_price,500.01);
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
