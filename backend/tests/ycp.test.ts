import {before,after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {testDatabase} from './postgres.js';
import {YcpCatalog,type YcpSettings} from '../src/ycp-catalog.js';
import {buildApp} from '../src/app.js';
import {DisabledOtpSender} from '../src/auth.js';
import {config} from '../src/config.js';

let ctx:Awaited<ReturnType<typeof testDatabase>>;
const token='ycp-test-only-token-with-at-least-32-characters';
before(async()=>{ctx=await testDatabase();});
after(async()=>{await ctx?.stop();});
beforeEach(async()=>{await ctx.db.pool.query('TRUNCATE products,warehouses,users,checkout_sessions,integration_inbox,integration_outbox CASCADE');});
async function fixture(){
 const db=ctx.db,product=randomUUID(),warehouse=randomUUID(),other=randomUUID(),inactive=randomUUID();
 await db.pool.query("INSERT INTO products(id,sku,name,active,sale_approved,weight_g,width_mm,height_mm,depth_mm) VALUES($1,'SKU-001','Тестовый гель',true,true,500,60,190,40)",[product]);
 await db.pool.query("INSERT INTO product_prices(product_id,currency,regular_minor,final_minor,approved) VALUES($1,'RUB',60000,50000,true)",[product]);
 await db.pool.query("INSERT INTO storefront_mappings(slug,product_id,confidence,approved,reason) VALUES('test-gel',$1,'high',true,'test')",[product]);
 await db.pool.query("INSERT INTO product_external_ids(provider,environment,account_id,external_id,product_id) VALUES('ycp','test','asaya-test','feed-001',$1)",[product]);
 for(const [id,name,active] of [[warehouse,'Москва',true],[other,'Казань',true],[inactive,'Закрытый',false]]){
  await db.pool.query('INSERT INTO warehouses(id,code,name,active) VALUES($1::uuid,$1::text,$2,$3)',[id,name,active]);
  await db.pool.query('INSERT INTO inventory_balances(product_id,warehouse_id,on_hand,reserved) VALUES($1,$2,10,3)',[product,id]);
 }
 const profile=(warehouseId:string,locality:string)=>({warehouseId,address:'Тестовый адрес',phone:'+79990000000',servedLocalities:[locality],ycpDeliveryEnabled:false});
 const settings:YcpSettings={accountId:'asaya-test',environment:'test',publicOrigin:'https://asaya.example.test',priceUnit:'minor',vat:0,warehouses:[profile(warehouse,'Москва'),profile(other,'Казань'),profile(inactive,'Москва')]};
 const request={items:[{id:'feed-001',quantity:2}],offers_id_from_merchant_center:true,locality:'Москва',is_health_check:false};
 return {db,product,warehouse,other,inactive,settings,request,service:new YcpCatalog(db,token,settings)};
}
test('YCP basket resolves scoped offer IDs and exposes exact prices, dimensions and available regional stock',async()=>{
 const f=await fixture(),result=await f.service.basket(f.request);
 assert.deepEqual(result,{items:[{id:'SKU-001',name:'Тестовый гель',regular_price:600,final_price:500,vat:0,url:'https://asaya.example.test/product/test-gel/',warehouses:[{id:f.warehouse,available_quantity:7}],dimensions:{width:60,height:190,depth:40,weight:500},characteristics:[],variations:[]}]});
 assert.deepEqual(await f.service.basket({...f.request,items:[{id:'SKU-001',quantity:100}],offers_id_from_merchant_center:false,is_health_check:true,locality:'  мОсКвА  '}),result);
 assert.equal((await f.service.basket({...f.request,locality:'Казань'})).items[0]!.warehouses[0].id,f.other);
 assert.deepEqual((await f.service.basket({...f.request,locality:'Неизвестный город'})).items[0]!.warehouses,[]);
 for(const table of ['orders','integration_inbox','integration_outbox'])assert.equal((await f.db.pool.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n,0);
 assert.equal((await f.db.pool.query('SELECT sum(reserved)::int n FROM inventory_balances')).rows[0].n,9);
 await f.db.pool.query('UPDATE inventory_balances SET reserved=on_hand WHERE warehouse_id=$1',[f.warehouse]);
 assert.equal((await f.service.basket(f.request)).items[0]!.warehouses[0].available_quantity,0);
});
test('YCP keeps scoped legacy aliases and never exposes unpublished or component-based products',async()=>{
 const f=await fixture();
 for(const request of [{...f.request,offers_id_from_merchant_center:false},{...f.request,items:[{id:'unknown',quantity:1}]}])await assert.rejects(f.service.basket(request),/PRODUCTS_NOT_FOUND/);
 await assert.rejects(new YcpCatalog(f.db,token,{...f.settings,accountId:'other-account'}).basket(f.request),/PRODUCTS_NOT_FOUND/);
 await f.db.pool.query("UPDATE product_external_ids SET environment='production'");await assert.rejects(f.service.basket(f.request),/PRODUCTS_NOT_FOUND/);await f.db.pool.query("UPDATE product_external_ids SET environment='test'");
 for(const [table,field] of [['products','active'],['products','sale_approved'],['product_prices','approved'],['storefront_mappings','approved']]){
  await f.db.pool.query(`UPDATE ${table} SET ${field}=false`);await assert.rejects(f.service.basket(f.request),/PRODUCTS_NOT_FOUND/);await f.db.pool.query(`UPDATE ${table} SET ${field}=true`);
 }
 const component=randomUUID();await f.db.pool.query("INSERT INTO products(id,sku,name) VALUES($1,'COMPONENT','test')",[component]);
 await f.db.pool.query('INSERT INTO product_components(product_id,component_id,quantity) VALUES($1,$2,1)',[f.product,component]);await assert.rejects(f.service.basket(f.request),/PRODUCTS_NOT_FOUND/);
});
test('YCP rejects invalid baskets, aliases of one SKU and fractional ruble rounding',async()=>{
 const f=await fixture();
 for(const raw of [{...f.request,items:[]},{...f.request,items:[{id:'feed-001',quantity:0}]},{...f.request,items:[{id:'feed-001',quantity:1.5}]},{...f.request,items:[...f.request.items,...f.request.items]},{...f.request,items:Array.from({length:51},(_,i)=>({id:String(i),quantity:1}))},{...f.request,regular_price:1},{...f.request,is_health_check:'true'}])await assert.rejects(f.service.basket(raw));
 await f.db.pool.query("INSERT INTO product_external_ids(provider,environment,account_id,external_id,product_id) VALUES('ycp','test','asaya-test','alias',$1)",[f.product]);
 await assert.rejects(f.service.basket({...f.request,items:[...f.request.items,{id:'alias',quantity:1}]}),/DUPLICATE_PRODUCT/);
 for(const setting of [{priceUnit:null},{vat:null}])assert.equal((await new YcpCatalog(f.db,token,{...f.settings,...setting}).basket(f.request)).items[0]!.final_price,500);
 const rubles=new YcpCatalog(f.db,token,{...f.settings,priceUnit:'rubles'});
 assert.equal((await rubles.basket(f.request)).items[0]!.final_price,500);
 await f.db.pool.query('UPDATE product_prices SET final_minor=50001');await assert.rejects(rubles.basket(f.request),/YCP_PRICE_NOT_REPRESENTABLE/);
 await assert.rejects(f.service.basket(f.request),/YCP_PRICE_NOT_REPRESENTABLE/);
 await f.db.pool.query('UPDATE product_prices SET final_minor=50000');
 await f.db.pool.query('UPDATE products SET weight_g=NULL');assert.equal('weight' in (await f.service.basket(f.request)).items[0]!.dimensions,false);
});
test('YCP warehouse pagination uses configured active warehouses and returns total even beyond the last page',async()=>{
 const f=await fixture(),all=await f.service.warehouses({limit:'1000',offset:'0'});
 assert.equal(all.total_count,2);assert.equal(all.warehouses.length,2);assert.ok(all.warehouses.every(w=>w.id!==f.inactive&&w.address==='Тестовый адрес'&&!w.self_pickup_options.enabled));
 assert.deepEqual((await f.service.warehouses({limit:1,offset:0})).warehouses.concat((await f.service.warehouses({limit:1,offset:1})).warehouses),all.warehouses);
 assert.deepEqual(await f.service.warehouses({limit:1,offset:50}),{warehouses:[],total_count:2});
 assert.deepEqual(await new YcpCatalog(f.db,token,{...f.settings,warehouses:[]}).warehouses({limit:1,offset:0}),{warehouses:[],total_count:0});
 for(const q of [{},{limit:1001,offset:0},{limit:1,offset:-1},{limit:1.1,offset:0}])await assert.rejects(f.service.warehouses(q));
});
test('YCP HTTP authenticates before parsing without browser cookies, and preserves store Origin protection',async()=>{
 const f=await fixture(),options={db:f.db,otpSecret:token,otpSender:new DisabledOtpSender(),origin:'http://127.0.0.1:3200',secureCookies:false};
 const app=await buildApp({...options,ycp:{token,settings:f.settings}}),url='/api/ycp/v1/checkout/basket/check';
 try{
  for(const authorization of [undefined,'Bearer wrong','Basic '+token,token,'Bearer '+token+' extra']){
   const r=await app.inject({method:'POST',url,headers:{...(authorization?{authorization}:{}),'content-type':'application/json'},payload:'{broken'});assert.equal(r.statusCode,401);assert.ok(!r.body.includes(token));
  }
  const headers={authorization:'Bearer '+token};
  const good=await app.inject({method:'POST',url,headers,payload:f.request});assert.equal(good.statusCode,200);assert.equal(good.headers['cache-control'],'no-store');assert.equal(good.json().items[0].id,'SKU-001');
  assert.equal((await app.inject({method:'POST',url,headers,payload:{}})).statusCode,400);
  assert.equal((await app.inject({url:'/api/ycp/v1/warehouses?limit=1&offset=0',headers})).statusCode,200);
  assert.equal((await app.inject({url:'/api/ycp/v1/warehouses?limit=1&offset=0'})).statusCode,401);
  assert.equal((await app.inject({method:'POST',url:'/api/store/v1/checkouts',headers,payload:{}})).statusCode,403);
  assert.equal((await app.inject({method:'POST',url:'/api/ycp/v1/checkout',headers,payload:{}})).statusCode,400);
 }finally{await app.close();}
 const disabled=await buildApp(options);
 try{assert.equal((await disabled.inject({method:'POST',url,payload:f.request})).statusCode,503);}finally{await disabled.close();}
});
test('YCP configuration requires paired credentials and refuses unsupported production or invalid settings',async()=>{
 const f=await fixture(),base={DATABASE_URL:'postgresql://localhost/test',OTP_SECRET:token};
 assert.throws(()=>config({...base,YCP_TOKEN:token}),/configured together/);assert.throws(()=>config({...base,YCP_SETTINGS_FILE:'test.json'}),/configured together/);
 assert.throws(()=>new YcpCatalog(f.db,token,{...f.settings,environment:'production'}),/production/);
 assert.throws(()=>new YcpCatalog(f.db,'short',f.settings));
 for(const change of [{warehouses:[f.settings.warehouses[0],f.settings.warehouses[0]]},{publicOrigin:'http://example.test'},{publicOrigin:'https://user:secret@example.test'},{priceUnit:'guessed'}])assert.throws(()=>new YcpCatalog(f.db,token,{...f.settings,...change}));
});

test('custom-site SKU works with either incoming identifier flag and never creates mappings',async()=>{
 const f=await fixture();await f.db.pool.query('DELETE FROM product_external_ids');
 for(const flag of [true,false]){
  const item=(await f.service.basket({...f.request,items:[{id:'SKU-001',quantity:1}],offers_id_from_merchant_center:flag})).items[0]!;
  assert.equal(item.id,'SKU-001');assert.equal(item.final_price,500);
 }
 assert.equal((await f.db.pool.query('SELECT 1 FROM product_external_ids')).rowCount,0);
});
