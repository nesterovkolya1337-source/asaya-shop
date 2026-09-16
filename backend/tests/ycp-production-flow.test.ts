import {before,after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {testDatabase} from './postgres.js';
import {buildApp} from '../src/app.js';
import {DisabledOtpSender} from '../src/auth.js';
import type {YcpSettings} from '../src/ycp-catalog.js';
import {CommerceService} from '../src/commerce.js';

let ctx:Awaited<ReturnType<typeof testDatabase>>;
const token='isolated-production-mode-test-'+'z'.repeat(40);
const origin='https://asaya.example.test';
before(async()=>{ctx=await testDatabase();});after(async()=>{await ctx?.stop();});
beforeEach(async()=>{await ctx.db.pool.query('TRUNCATE products,warehouses,users,checkout_sessions,integration_inbox,integration_outbox CASCADE');});

async function fixture(){
 const product=randomUUID(),warehouse=randomUUID(),db=ctx.db;
 await db.pool.query("INSERT INTO warehouses(id,code,name,active) VALUES($1,'PROD-FIXTURE','Тестовый склад',true)",[warehouse]);
 await db.pool.query("INSERT INTO products(id,sku,name,active,sale_approved,weight_g,width_mm,height_mm,depth_mm) VALUES($1,'SKU-PROD','Тестовый товар',true,true,500,50,190,50)",[product]);
 await db.pool.query("INSERT INTO product_prices(product_id,currency,regular_minor,final_minor,approved) VALUES($1,'RUB',60000,50000,true)",[product]);
 await db.pool.query("INSERT INTO storefront_mappings(slug,product_id,approved,confidence,reason) VALUES('production-fixture',$1,true,'high','isolated test')",[product]);
 await db.pool.query('INSERT INTO inventory_balances(product_id,warehouse_id,on_hand) VALUES($1,$2,10)',[product,warehouse]);
 await db.pool.query("INSERT INTO product_external_ids(provider,account_id,environment,external_id,product_id) VALUES('ycp','fixture','production','OFFER',$1)",[product]);
 const settings:YcpSettings={accountId:'fixture',environment:'production',publicOrigin:origin,priceUnit:'minor',vat:0,checkout:{deliveryPriceUnit:'rubles'},button:{enabled:false},warehouses:[{warehouseId:warehouse,address:'Тестовый адрес',phone:'+79990000000',servedLocalities:['*'],ycpDeliveryEnabled:true}]};
 const app=await buildApp({db,deploymentMode:'ycp',otpSecret:'o'.repeat(32),staffSecret:'s'.repeat(32),otpSender:new DisabledOtpSender(),origin,secureCookies:true,ycp:{token,settings}});
 const body={session_id:'session',warehouse_id:warehouse,items:[{id:'SKU-PROD',quantity:1,regular_price:60000,final_price:50000}],customer:{full_name:'Тестовый покупатель',email:'buyer@example.test',phone:'+79990000000'},delivery:{delivery_method:'pickup_point',service_type:'cdek',price:100.29,address:{pickup_point_id:'TEST-PVZ'},delivery_date_interval:{start_interval:{date:'2026-09-10'},end_interval:{date:'2026-09-12'},time_zone:3}}};
 const headers={authorization:'Bearer '+token};
 return {db,app,headers,body,product};
}

test('working protocol checks basket, reserves, confirms Pay and handles delivered replay once',async()=>{
 const f=await fixture();
 try{
  const basket=await f.app.inject({method:'POST',url:'/api/v1/checkout/basket/check',headers:f.headers,payload:{items:[{id:'OFFER',quantity:1}],offers_id_from_merchant_center:true,locality:'Владивосток',is_health_check:false}});
  assert.equal(basket.statusCode,200);assert.equal(basket.json().items[0].final_price,50000);
  const create=await f.app.inject({method:'POST',url:'/api/v1/checkout',headers:f.headers,payload:f.body});
  assert.equal(create.statusCode,201,create.body);
  const replay=await f.app.inject({method:'POST',url:'/api/ycp/v1/checkout',headers:f.headers,payload:f.body});
  assert.equal(replay.statusCode,201);assert.deepEqual(replay.json(),create.json());
  const placed={session_id:'session',order_id:'external',order_number:123,payment_method:'online',online_payment_method:'split',acquiring_id:'test-acquiring'};
  for(const base of ['/api/v1','/api/ycp/v1']){
   const response=await f.app.inject({method:'POST',url:base+'/checkout/placed',headers:f.headers,payload:placed});
   assert.equal(response.statusCode,200,response.body);
  }
  const payment=await f.db.pool.query('SELECT environment,amount_minor FROM payments');
  assert.equal(payment.rowCount,1);assert.equal(payment.rows[0].environment,'production');assert.equal(payment.rows[0].amount_minor,'60029');
  const session=(await f.db.pool.query('SELECT environment FROM ycp_sessions')).rows[0];assert.equal(session.environment,'production');
  for(let i=0;i<2;i++){
   const delivered=await f.app.inject({method:'POST',url:'/api/v1/order/delivered?order_id=external',headers:f.headers,payload:{purchased_items:[{id:'SKU-PROD',quantity:1}]}});
   assert.equal(delivered.statusCode,200,delivered.body);
  }
  const inventory=(await f.db.pool.query('SELECT on_hand,reserved FROM inventory_balances')).rows[0];
  assert.deepEqual(inventory,{on_hand:9,reserved:0});
  const order=await f.app.inject({method:'GET',url:'/api/v1/order?order_id=external',headers:f.headers});
  assert.equal(order.statusCode,200);assert.equal(order.json().delivery_statuses.at(-1).status,'delivered');
 }finally{await f.app.close();}
});

test('working protocol rejects price changes, and cancelled checkout releases stock exactly once',async()=>{
 const f=await fixture();
 try{
  const changed=await f.app.inject({method:'POST',url:'/api/v1/checkout',headers:f.headers,payload:{...f.body,items:[{...f.body.items[0],final_price:1}]}});
  assert.equal(changed.statusCode,409,changed.body);assert.equal((await f.db.pool.query('SELECT 1 FROM orders')).rowCount,0);
  const create=await f.app.inject({method:'POST',url:'/api/v1/checkout',headers:f.headers,payload:f.body});assert.equal(create.statusCode,201,create.body);
  for(let i=0;i<2;i++){
   const cancelled=await f.app.inject({method:'POST',url:'/api/v1/checkout/cancel?session_id=session',headers:f.headers});assert.equal(cancelled.statusCode,200,cancelled.body);
  }
  const inventory=(await f.db.pool.query('SELECT on_hand,reserved FROM inventory_balances')).rows[0];assert.deepEqual(inventory,{on_hand:10,reserved:0});
  assert.equal((await f.db.pool.query('SELECT status FROM orders')).rows[0].status,'cancelled');
  assert.equal((await f.db.pool.query('SELECT 1 FROM payments')).rowCount,0);
 }finally{await f.app.close();}
});

test('production timeout requests scoped payment reconciliation and cannot release stock without a provider result',async()=>{
 const f=await fixture();
 try{
  const create=await f.app.inject({method:'POST',url:'/api/v1/checkout',headers:f.headers,payload:f.body});assert.equal(create.statusCode,201,create.body);
  const clock=()=>new Date(Date.now()+2*60*60*1000);
  const service=new CommerceService(f.db,clock,'production');
  await assert.rejects(service.expire(),/YCP_EXPIRY_SCOPE_REQUIRED/);
  assert.equal(await service.expire({accountId:'another-account',environment:'production'}),0);
  assert.equal(await new CommerceService(f.db,clock).expire(),0);
  assert.equal((await f.db.pool.query("SELECT 1 FROM integration_outbox WHERE kind='ycp.payment_reconcile_required'")).rowCount,0);
  assert.equal((await f.db.pool.query('SELECT reserved FROM inventory_balances')).rows[0].reserved,1);
  assert.equal(await service.expire({accountId:'fixture',environment:'production'}),0);
  assert.equal(await service.expire({accountId:'fixture',environment:'production'}),0);
  assert.equal((await f.db.pool.query("SELECT 1 FROM integration_outbox WHERE kind='ycp.payment_reconcile_required'")).rowCount,1);
  assert.deepEqual((await f.db.pool.query('SELECT on_hand,reserved FROM inventory_balances')).rows[0],{on_hand:10,reserved:1});
  assert.equal((await f.db.pool.query('SELECT payment_status FROM orders')).rows[0].payment_status,'pending');
  for(let i=0;i<2;i++)assert.equal((await f.app.inject({method:'POST',url:'/api/v1/checkout/cancel?session_id=session',headers:f.headers})).statusCode,200);
  assert.deepEqual((await f.db.pool.query('SELECT on_hand,reserved FROM inventory_balances')).rows[0],{on_hand:10,reserved:0});
 }finally{await f.app.close();}
});
