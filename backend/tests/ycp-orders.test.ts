import {YcpRequestTrace} from '../src/ycp-request-trace.js';
import {AdminIntegration} from '../src/admin-integration.js';
import {before,after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {testDatabase} from './postgres.js';
import {YcpCheckout} from '../src/ycp-checkout.js';
import {YcpOrders} from '../src/ycp-orders.js';
import {CommerceService} from '../src/commerce.js';
import {buildApp} from '../src/app.js';
import {DisabledOtpSender} from '../src/auth.js';
import {AdminOrders} from '../src/admin-orders.js';
import type {YcpSettings} from '../src/ycp-catalog.js';
let ctx:Awaited<ReturnType<typeof testDatabase>>;
const token='ycp-order-test-token-with-more-than-32-characters';
before(async()=>{ctx=await testDatabase();});after(async()=>{await ctx?.stop();});
beforeEach(async()=>{await ctx.db.pool.query('TRUNCATE products,warehouses,users,checkout_sessions,integration_inbox,integration_outbox CASCADE');});
async function fixture(cod=false){
 const db=ctx.db,warehouse=randomUUID();await db.pool.query("INSERT INTO warehouses(id,code,name,active) VALUES($1,'YCP','Test warehouse',true)",[warehouse]);
 for(const sku of ['YCP-A','YCP-B']){const product=randomUUID();
  await db.pool.query('INSERT INTO products(id,sku,name,active,sale_approved,weight_g,width_mm,height_mm,depth_mm) VALUES($1,$2,$2,true,true,500,50,100,50)',[product,sku]);
  await db.pool.query("INSERT INTO product_prices(product_id,currency,regular_minor,final_minor,approved) VALUES($1,'RUB',10000,10000,true)",[product]);
  await db.pool.query("INSERT INTO storefront_mappings(slug,product_id,approved,confidence,reason) VALUES($1,$2,true,'high','test')",[sku,product]);
  await db.pool.query('INSERT INTO inventory_balances(product_id,warehouse_id,on_hand) VALUES($1,$2,10)',[product,warehouse]);
 }
 const settings:YcpSettings={accountId:'ycp-orders-test',environment:'test',publicOrigin:'https://asaya.example.test',priceUnit:'minor',vat:0,checkout:{deliveryPriceUnit:'minor'},warehouses:[{warehouseId:warehouse,address:'Test address',phone:'+79990000000',servedLocalities:['Москва'],ycpDeliveryEnabled:false}]};
 const checkout=new YcpCheckout(db,settings),orders=new YcpOrders(db,settings),external='external-order';
 await checkout.create({session_id:'session',warehouse_id:warehouse,items:[{id:'YCP-A',quantity:2,regular_price:100,final_price:100},{id:'YCP-B',quantity:1,regular_price:100,final_price:100}],customer:{full_name:'Private Name',phone:'+79990000000',email:'private@example.test'},delivery:{delivery_method:'courier',service_type:'yandex_delivery',price:10,address:{locality:'Москва',address:'Private street'},delivery_date_interval:{start_interval:{date:'2026-09-09'},end_interval:{date:'2026-09-10'},time_zone:3}}});
 await checkout.placed({session_id:'session',order_id:external,order_number:1,payment_method:cod?'on_delivery':'online',...(cod?{}:{acquiring_id:'acquiring-order',online_payment_method:'card'})});
 const id=(await db.pool.query('SELECT id FROM orders')).rows[0].id;
 return {db,settings,checkout,orders,id,q:{order_id:external},commerce:new CommerceService(db)};
}
const full={purchased_items:[{id:'YCP-A',quantity:2},{id:'YCP-B',quantity:1}]};

test('admin sees review signals by order without queue secrets; processing an event does not imply resolution',async()=>{
 const f=await fixture(),actor=randomUUID(),admin=new AdminOrders(f.db);
 await f.db.pool.query("INSERT INTO users(id,role) VALUES($1,'admin')",[actor]);
 assert.deepEqual((await admin.detail(actor,f.id)).reviewSignals,[]);
 await f.orders.delivered(f.q,{purchased_items:[{id:'YCP-A',quantity:1}]});
 await f.db.pool.query("UPDATE integration_outbox SET status='done',payload=$1,last_error='PRIVATE diagnostic'",[JSON.stringify({secret:'PRIVATE payload'})]);
 await f.db.pool.query("INSERT INTO integration_outbox(id,kind,aggregate_id,payload,dedupe_key) VALUES($1,'payment.late_review',$2,'{}',$3)",[randomUUID(),randomUUID(),randomUUID()]);
 const result=await admin.detail(actor,f.id);
 assert.deepEqual(result.reviewSignals.map((s:{kind:string})=>s.kind).sort(),['payment.refund_review','ycp.return_review']);
 assert.ok(result.reviewSignals.every((s:{createdAt:Date})=>Number.isFinite(new Date(s.createdAt).getTime())));
 assert.ok(!JSON.stringify(result.reviewSignals).includes('PRIVATE'));
 const customer=(await f.db.pool.query('SELECT user_id FROM orders WHERE id=$1',[f.id])).rows[0].user_id;
 assert.equal('reviewSignals' in await f.commerce.order(customer,f.id),false);
 await assert.rejects(admin.detail(customer,f.id),/FORBIDDEN/);
 await f.db.pool.query('UPDATE users SET disabled=true WHERE id=$1',[actor]);await assert.rejects(admin.detail(actor,f.id),/FORBIDDEN/);
});
async function balances(){return (await ctx.db.pool.query('SELECT p.sku,b.on_hand,b.reserved FROM inventory_balances b JOIN products p ON p.id=b.product_id ORDER BY p.sku')).rows;}

test('YCP reflects a corrected CDEK status without resurrecting a deleted delivered event from legacy history',async()=>{
 const f=await fixture(),at=new Date();
 await f.db.pool.query("INSERT INTO order_logistics(order_id,account_id,environment,delivery_status) VALUES($1,'cdek-test','test','delivered')",[f.id]);
 await f.db.pool.query("INSERT INTO order_logistics_events(id,order_id,provider,raw_status,status,occurred_at,observed_at) VALUES($1,$2,'cdek','DELIVERED','delivered',$3,$3)",[randomUUID(),f.id,at]);
 await f.db.pool.query("INSERT INTO order_status_history(id,order_id,kind,status,source,occurred_at) VALUES($1,$2,'delivery','delivered','cdek',$3)",[randomUUID(),f.id,at]);
 await f.db.pool.query("UPDATE orders SET delivery_status='delivered' WHERE id=$1",[f.id]);
 assert.equal((await f.orders.get(f.q)).delivery_statuses.at(-1)!.status,'delivered');
 await f.db.pool.query('UPDATE order_logistics_events SET deleted=true WHERE order_id=$1',[f.id]);
 await f.db.pool.query("UPDATE order_logistics SET delivery_status='in_transit' WHERE order_id=$1",[f.id]);
 const corrected=await f.orders.get(f.q);
 assert.equal(corrected.delivery_statuses.at(-1)!.status,'in_progress');
 assert.equal(corrected.delivery_statuses.some(s=>s.status==='delivered'),false);
 assert.equal((await f.db.pool.query('SELECT payment_status FROM orders WHERE id=$1',[f.id])).rows[0].payment_status,'paid');
});
async function state(){return (await ctx.db.pool.query('SELECT status,payment_status,delivery_status FROM orders')).rows[0];}
async function eventCount(kind:string){return (await ctx.db.pool.query('SELECT 1 FROM integration_outbox WHERE kind=$1',[kind])).rowCount;}
async function dispatch(f:Awaited<ReturnType<typeof fixture>>){const actor=randomUUID();await f.db.pool.query("INSERT INTO users(id,role) VALUES($1,'admin')",[actor]);await f.commerce.adminStartProcessing(actor,f.id,{});await f.commerce.adminCompletePacking(actor,f.id,{items:[{sku:'YCP-A',quantity:2},{sku:'YCP-B',quantity:1}]});await f.commerce.adminDispatch(actor,f.id,{carrier:'Test carrier',trackingNumber:'TEST-123',confirmed:true});}
test('YCP order projection is account scoped, always starts with new and contains no customer or payment details',async()=>{
 const f=await fixture(),r=await f.orders.get(f.q);
 assert.deepEqual(r.items,[{id:'YCP-A',quantity:2,refused_count:0},{id:'YCP-B',quantity:1,refused_count:0}]);assert.equal(r.delivery_statuses[0]!.status,'new');assert.ok(Number.isInteger(r.delivery_statuses[0]!.timestamp));
 assert.deepEqual(Object.keys(r).sort(),['delivery_statuses','items']);assert.ok(!JSON.stringify(r).includes('Private'));assert.ok(!JSON.stringify(r).includes('acquiring'));
 await assert.rejects(f.orders.get({order_id:f.id}),/ORDER_NOT_FOUND/);await assert.rejects(new YcpOrders(f.db,{...f.settings,accountId:'other'}).get(f.q),/ORDER_NOT_FOUND/);
 await dispatch(f);await f.db.pool.query("UPDATE shipments SET tracking_url='https://tracking.example.test/TEST-123'");
 const shipped=await f.orders.get(f.q);assert.equal(shipped.delivery_statuses.at(-1)!.status,'in_progress');assert.equal(shipped.tracking_url,'https://tracking.example.test/TEST-123');assert.equal(shipped.delivery_statuses.filter(s=>s.status==='in_progress').length,1);
 await f.db.pool.query("UPDATE shipments SET tracking_url='https://user:secret@tracking.example.test/'");assert.equal((await f.orders.get(f.q)).tracking_url,undefined);
});
test('YCP full delivery consumes stock exactly once and repeated messages leave payments and history unchanged',async()=>{
 const f=await fixture(),payments=(await f.db.pool.query('SELECT * FROM payments')).rows;
 await Promise.all(Array.from({length:6},()=>f.orders.delivered(f.q,full)));
 assert.deepEqual(await state(),{status:'completed',payment_status:'paid',delivery_status:'delivered'});
 assert.deepEqual(await balances(),[{sku:'YCP-A',on_hand:8,reserved:0},{sku:'YCP-B',on_hand:9,reserved:0}]);
 assert.deepEqual((await f.db.pool.query('SELECT * FROM payments')).rows,payments);
 assert.equal(await eventCount('ycp.order.delivered'),1);assert.equal(await eventCount('payment.refund_review'),0);
 assert.equal((await f.db.pool.query("SELECT 1 FROM inventory_movements WHERE kind='ship'")).rowCount,2);
 const r=await f.orders.get(f.q);assert.equal(r.delivery_statuses.at(-1)!.status,'delivered');assert.ok(r.items.every((i:any)=>i.refused_count===0));
 await assert.rejects(f.orders.delivered(f.q,{purchased_items:[]}),/ORDER_EVENT_CONFLICT/);await assert.rejects(f.orders.cancel(f.q),/DELIVERED_ORDER_REQUIRES_RETURN/);
});
test('YCP partial delivery records refused quantities and queues review without restocking or inventing a refund',async()=>{
 const f=await fixture();await f.orders.delivered(f.q,{purchased_items:[{id:'YCP-A',quantity:1}]});
 assert.deepEqual((await f.orders.get(f.q)).items,[{id:'YCP-A',quantity:2,refused_count:1},{id:'YCP-B',quantity:1,refused_count:1}]);
 assert.deepEqual(await balances(),[{sku:'YCP-A',on_hand:8,reserved:0},{sku:'YCP-B',on_hand:9,reserved:0}]);assert.equal((await state()).payment_status,'paid');
 assert.equal(await eventCount('payment.refund_review'),1);assert.equal(await eventCount('ycp.return_review'),1);assert.equal((await f.db.pool.query('SELECT 1 FROM refunds')).rowCount,0);
});
test('YCP delivery after manual dispatch never consumes the same stock twice',async()=>{
 const f=await fixture();await dispatch(f);const before=await balances();await f.orders.delivered(f.q,full);assert.deepEqual(await balances(),before);
 assert.equal((await f.db.pool.query("SELECT 1 FROM inventory_movements WHERE kind='ship'")).rowCount,2);assert.equal((await f.db.pool.query('SELECT status FROM shipments')).rows[0].status,'delivered');
});
test('YCP pre-dispatch cancellation releases once and keeps payment facts for refund review',async()=>{
 const f=await fixture();await Promise.all([f.orders.cancel(f.q),f.orders.cancel(f.q)]);
 assert.deepEqual(await balances(),[{sku:'YCP-A',on_hand:10,reserved:0},{sku:'YCP-B',on_hand:10,reserved:0}]);
 assert.deepEqual(await state(),{status:'cancelled',payment_status:'paid',delivery_status:'cancelled'});assert.equal(await eventCount('payment.refund_review'),1);
 assert.deepEqual((await f.orders.get(f.q)).items,[{id:'YCP-A',quantity:2,refused_count:2},{id:'YCP-B',quantity:1,refused_count:1}]);
 assert.equal((await f.db.pool.query("SELECT 1 FROM inventory_movements WHERE kind='release'")).rowCount,2);await assert.rejects(f.orders.delivered(f.q,full),/ORDER_CANCELLED/);
});
test('YCP cancellation of dispatched goods does not put an in-transit parcel back into stock',async()=>{
 const f=await fixture();await dispatch(f);const before=await balances();await f.orders.cancel(f.q);assert.deepEqual(await balances(),before);
 assert.equal(await eventCount('ycp.return_review'),1);assert.equal(await eventCount('payment.refund_review'),1);assert.equal((await f.db.pool.query("SELECT 1 FROM inventory_movements WHERE kind='release'")).rowCount,0);
});
test('YCP cancellation of an unpaid placed order cancels payment expectation and old cancellation counters project correctly',async()=>{
 const f=await fixture(true);await f.orders.cancel(f.q);assert.equal((await state()).payment_status,'cancelled');assert.equal(await eventCount('payment.refund_review'),0);
 await f.db.pool.query('UPDATE order_items SET refused_count=0');assert.ok((await f.orders.get(f.q)).items.every((i:any)=>i.refused_count===i.quantity));
 assert.equal((await f.orders.get(f.q)).delivery_statuses.at(-1)!.status,'cancelled');
});
test('YCP cash on delivery completion requires payment reconciliation and full refusal is representable',async()=>{
 const f=await fixture(true);await f.orders.delivered(f.q,{purchased_items:[]});assert.equal((await state()).payment_status,'pending');assert.equal(await eventCount('ycp.cod_payment_review'),1);
 assert.equal(await eventCount('payment.refund_review'),0);assert.equal((await f.db.pool.query('SELECT 1 FROM payments')).rowCount,0);assert.ok((await f.orders.get(f.q)).items.every((i:any)=>i.refused_count===i.quantity));
});
test('YCP validation rejects unknown or excessive purchases, duplicates and released reservations without mutation',async()=>{
 const f=await fixture();const before=await balances();
 for(const body of [{purchased_items:[{id:'unknown',quantity:1}]},{purchased_items:[{id:'YCP-A',quantity:3}]},{purchased_items:[{id:'YCP-A',quantity:1},{id:'YCP-A',quantity:1}]},{purchased_items:[{id:'YCP-A',quantity:-1}]},{purchased_items:[{id:'YCP-A',quantity:0.5}]},{}])await assert.rejects(f.orders.delivered(f.q,body));
 assert.deepEqual(await balances(),before);assert.equal((await state()).status,'placed');
 await f.db.pool.query("UPDATE inventory_reservations SET status='released'");await assert.rejects(f.orders.delivered(f.q,full),/INVENTORY_STATE_REQUIRES_REVIEW/);
});
test('YCP concurrent cancellation and delivery serialize into one valid final outcome',async()=>{
 const f=await fixture();const results=await Promise.allSettled([f.orders.cancel(f.q),f.orders.delivered(f.q,full)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const s=await state(),b=await balances();assert.ok((s.status==='cancelled'&&b[0].on_hand===10)||(s.status==='completed'&&b[0].on_hand===8));assert.ok(b.every(r=>r.reserved===0));
});
test('YCP delivery and order cancellation are fully rolled back if audit recording fails',async()=>{
 const f=await fixture(),before=await balances();await f.db.pool.query("CREATE FUNCTION fail_ycp_order() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test audit failure'; END $$");await f.db.pool.query('CREATE TRIGGER fail_ycp_order BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION fail_ycp_order()');
 try{
  await assert.rejects(f.orders.delivered(f.q,full),/test audit failure/);await assert.rejects(f.orders.cancel(f.q),/test audit failure/);
  assert.deepEqual(await balances(),before);assert.equal((await state()).status,'placed');assert.equal((await f.db.pool.query('SELECT 1 FROM ycp_order_receipts')).rowCount,0);assert.ok((await f.orders.get(f.q)).items.every((i:any)=>i.refused_count===0));
 }finally{await f.db.pool.query('DROP TRIGGER fail_ycp_order ON audit_log');await f.db.pool.query('DROP FUNCTION fail_ycp_order()');}
 await f.orders.delivered(f.q,full);
});
test('YCP order HTTP requires Bearer before parsing, protects account scope and returns contract fields',async()=>{
 const f=await fixture(),options={db:f.db,otpSecret:token,otpSender:new DisabledOtpSender(),origin:'http://127.0.0.1:3200',secureCookies:false},app=await buildApp({...options,ycp:{token,settings:f.settings}}),base='/api/ycp/v1/order',headers={authorization:'Bearer '+token};
 try{
  assert.equal((await app.inject({url:base+'?order_id=external-order'})).statusCode,401);
  for(const path of ['/cancel','/delivered'])assert.equal((await app.inject({method:'POST',url:base+path+'?order_id=external-order',headers:{'content-type':'application/json'},payload:'{bad'})).statusCode,401);
  const r=await app.inject({url:base+'?order_id=external-order',headers});assert.equal(r.statusCode,200);assert.equal(r.headers['cache-control'],'no-store');assert.equal(r.json().delivery_statuses[0].status,'new');
  assert.equal((await app.inject({url:base+'?order_id=unknown',headers})).statusCode,404);
  assert.equal((await app.inject({method:'POST',url:base+'/delivered?order_id=external-order',headers,payload:full})).statusCode,200);
  assert.equal((await app.inject({method:'POST',url:base+'/cancel?order_id=external-order',headers})).statusCode,409);
 }finally{await app.close();}
 const off=await buildApp(options);try{assert.equal((await off.inject({url:base+'?order_id=external-order',headers})).statusCode,503);}finally{await off.close();}
});

test('confirmed COD can be packed and dispatched once without inventing payment',async()=>{
 const f=await fixture(true),actor=randomUUID();await f.db.pool.query("INSERT INTO users(id,role) VALUES($1,'admin')",[actor]);
 assert.equal((await new AdminOrders(f.db).detail(actor,f.id)).paymentOnDelivery,true);
 await Promise.all(Array.from({length:3},()=>f.commerce.adminStartProcessing(actor,f.id,{})));
 const items=[{sku:'YCP-A',quantity:2},{sku:'YCP-B',quantity:1}];
 await Promise.all(Array.from({length:3},()=>f.commerce.adminCompletePacking(actor,f.id,{items})));
 const input={carrier:'Test',trackingNumber:'COD-1',confirmed:true};
 await Promise.all(Array.from({length:3},()=>f.commerce.adminDispatch(actor,f.id,input)));
 assert.deepEqual(await state(),{status:'processing',payment_status:'pending',delivery_status:'shipped'});
 await assert.rejects(f.commerce.adminCompleteOrder(actor,f.id,{reason:'Test evidence',confirmed:true}),/ORDER_NOT_READY_FOR_COMPLETION/);
 for(const kind of ['order.processing_started','order.packing_completed','order.dispatched'])assert.equal(await eventCount(kind),1);
 const before=await balances();await f.orders.delivered(f.q,full);assert.deepEqual(await balances(),before);
 assert.equal((await state()).payment_status,'pending');assert.equal(await eventCount('ycp.cod_payment_review'),1);
 assert.equal((await f.db.pool.query('SELECT 1 FROM payments')).rowCount,0);
 assert.equal((await f.db.pool.query("SELECT 1 FROM inventory_movements WHERE kind='ship'")).rowCount,2);
});
test('unconfirmed, wrong environment, online and failed payments cannot use COD fulfilment',async()=>{
 const f=await fixture(true),actor=randomUUID();await f.db.pool.query("INSERT INTO users(id,role) VALUES($1,'admin')",[actor]);
 for(const change of ["payment_method='online'","environment='production'","placement_outcome='late_review'","placement_hash=NULL","external_order_id=NULL"]){
  await f.db.pool.query('UPDATE ycp_sessions SET '+change);
  assert.equal(await f.commerce.isPaymentOnDelivery(f.id),false);
  await assert.rejects(f.commerce.adminStartProcessing(actor,f.id,{}),/ORDER_NOT_READY_FOR_PROCESSING/);
  await f.db.pool.query("UPDATE ycp_sessions SET payment_method='on_delivery',environment='test',placement_outcome='placed',placement_hash='test',external_order_id='external-order'");
 }
 await f.commerce.adminStartProcessing(actor,f.id,{});
 await f.db.pool.query("UPDATE orders SET payment_status='failed'");
 await assert.rejects(f.commerce.adminCompletePacking(actor,f.id,{items:[{sku:'YCP-A',quantity:2},{sku:'YCP-B',quantity:1}]}),/ORDER_NOT_READY_FOR_PACKING/);
 await assert.rejects(f.commerce.adminDispatch(actor,f.id,{carrier:'Test',trackingNumber:'COD-2',confirmed:true}),/ORDER_NOT_READY_FOR_DISPATCH/);
 assert.deepEqual(await balances(),[{sku:'YCP-A',on_hand:10,reserved:2},{sku:'YCP-B',on_hand:10,reserved:1}]);
});

test('integration issues are admin-only, paginated, filterable and never expose queue secrets',async()=>{
 const f=await fixture(),actor=randomUUID();await f.db.pool.query("INSERT INTO users(id,role) VALUES($1,'admin')",[actor]);
 const service=new AdminIntegration(f.db);assert.deepEqual((await service.list(actor,{})).items,[]);
 for(let n=0;n<23;n++)await f.db.pool.query("INSERT INTO integration_outbox(id,kind,aggregate_id,payload,dedupe_key,status,attempts,last_error,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",[randomUUID(),n===0?'payment.refund_review':'PRIVATE_KIND',f.id,JSON.stringify({secret:'PRIVATE_PAYLOAD'}),randomUUID(),n===0?'done':'failed',n===0?0:8,n===0?null:'PRIVATE_TOKEN',new Date(1750000000000+n*1000)]);
 const first=await service.list(actor,{});assert.equal(first.items.length,20);assert.ok(first.nextCursor);
 const second=await service.list(actor,{cursor:first.nextCursor});assert.equal(second.items.length,3);assert.equal(second.nextCursor,null);
 assert.equal(new Set([...first.items,...second.items].map(i=>i.id)).size,23);
 const text=JSON.stringify(first);assert.ok(!text.includes('PRIVATE'));assert.equal(first.items[0]!.order!.id,f.id);assert.equal(first.items[0]!.ycp!.orderId,'external-order');assert.equal(first.items[0]!.error,'HANDLER_FAILED');
 const review=await service.list(actor,{filter:'review'});assert.equal(review.items.length,1);assert.equal(review.items[0]!.status,'done');assert.equal(review.items[0]!.review,true);
 assert.equal((await service.list(actor,{filter:'errors'})).items.length,20);
 await assert.rejects(service.list(actor,{filter:'bad'}));await assert.rejects(service.list(actor,{cursor:randomUUID()}),/INVALID_CURSOR/);
 const buyer=(await f.db.pool.query('SELECT user_id FROM orders WHERE id=$1',[f.id])).rows[0].user_id;await assert.rejects(service.list(buyer,{}),/FORBIDDEN/);
 await f.db.pool.query('UPDATE users SET disabled=true WHERE id=$1',[actor]);await assert.rejects(service.list(actor,{}),/FORBIDDEN/);
 const app=await buildApp({db:f.db,otpSecret:token,staffSecret:token,otpSender:new DisabledOtpSender(),origin:'http://127.0.0.1:3200',secureCookies:false});
 try{const r=await app.inject({url:'/api/admin/v1/integration-issues'});assert.equal(r.statusCode,401);assert.equal(r.headers['cache-control'],'no-store');assert.ok(!r.body.includes('external-order'));}finally{await app.close();}
});

test('YCP trace scopes order resolution and hides raw incoming identifiers including unresolved failures',async()=>{
 const f=await fixture(),trace=new YcpRequestTrace(f.db,f.settings,token);
 const matched=await trace.resolve('/api/ycp/v1/order',{},f.q);assert.equal(matched.orderId,f.id);assert.equal(matched.correlation,'matched');
 const session=await trace.resolve('/api/ycp/v1/checkout',{session_id:'session',customer:{name:'PRIVATE'}},{});assert.equal(session.orderId,f.id);
 const unknown=await trace.resolve('/api/ycp/v1/order',{}, {order_id:'PRIVATE-unknown'});assert.equal(unknown.correlation,'unmatched');assert.ok(!JSON.stringify(unknown).includes('PRIVATE'));
 assert.deepEqual(await trace.resolve('/api/ycp/v1/order',{}, {order_id:'PRIVATE-unknown'}),unknown);
 assert.notEqual((await trace.resolve('/api/ycp/v1/order',{}, {order_id:'another'})).ycpReference,unknown.ycpReference);
 assert.equal((await new YcpRequestTrace(f.db,{...f.settings,accountId:'other'},token).resolve('/api/ycp/v1/order',{},f.q)).orderId,undefined);
 assert.notEqual((await new YcpRequestTrace(f.db,{...f.settings,accountId:'other'},token).resolve('/api/ycp/v1/order',{},f.q)).ycpReference,matched.ycpReference);
 assert.deepEqual(await trace.resolve('/api/ycp/v1/checkout/basket/check',{session_id:'PRIVATE'},{}),{});
 assert.deepEqual(await trace.resolve('/api/ycp/v1/order',{}, {order_id:['bad']}),{});
 const unavailable=new YcpRequestTrace({pool:{query:async()=>{throw new Error('PRIVATE');}}} as any,f.settings,token);
 const failure=await unavailable.resolve('/api/ycp/v1/order',{},f.q);assert.equal(failure.correlation,'unavailable');assert.ok(!JSON.stringify(failure).includes('PRIVATE'));
});
test('HTTP request tracing uses fresh server IDs, correlates authenticated callbacks and ignores spoofed IDs',async()=>{
 const f=await fixture(),records:Array<Record<string,unknown>>=[];
 const recorded=async(id:unknown)=>{for(let n=0;n<200;n++){const r=records.find(r=>r.requestId===id);if(r)return r;await new Promise(resolve=>setTimeout(resolve,10));}throw new Error('Completion log missing');};
 const app=await buildApp({db:f.db,otpSecret:token,otpSender:new DisabledOtpSender(),origin:'http://127.0.0.1:3200',secureCookies:false,logger:true,ycp:{token,settings:f.settings}});
 app.addHook('onRequest',async req=>{req.log.info=((fields:Record<string,unknown>)=>{records.push(fields);}) as typeof req.log.info;});
 try{
  const good=await app.inject({url:'/api/ycp/v1/order?order_id=external-order',headers:{authorization:'Bearer '+token,'x-request-id':'PRIVATE-SPOOF'}});
  assert.equal(good.statusCode,200);const id=good.headers['x-request-id'];assert.match(String(id),/^[a-f0-9-]{36}$/);
  assert.equal((await recorded(id)).orderId,f.id);
  const missing=await app.inject({url:'/api/ycp/v1/order?order_id=PRIVATE-UNKNOWN',headers:{authorization:'Bearer '+token}});
  assert.equal(missing.statusCode,404);assert.equal(missing.json().requestId,missing.headers['x-request-id']);
  assert.equal((await recorded(missing.headers['x-request-id'])).correlation,'unmatched');
  assert.notEqual(id,missing.headers['x-request-id']);assert.ok(!JSON.stringify(records).includes('PRIVATE'));assert.ok(!JSON.stringify(records).includes(token));
  const denied=await app.inject({url:'/api/ycp/v1/order?order_id=external-order'});assert.equal(denied.statusCode,401);
  assert.equal(records.find(r=>r.requestId===denied.headers['x-request-id'])?.orderId,undefined);
 }finally{await app.close();}
});
