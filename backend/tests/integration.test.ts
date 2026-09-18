import { before,after,beforeEach,test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { testDatabase } from './postgres.js';
import { CommerceService,cartHash, type CheckoutInput } from '../src/commerce.js';
import { AuthService,DisabledOtpSender,type OtpSender } from '../src/auth.js';
import { Database } from '../src/db.js';
import { buildApp } from '../src/app.js';
import { inspectImport,importCatalog } from '../src/importer.js';
import { processOne } from '../src/outbox.js';
import { hash } from '../src/core.js';
import { applyMappingApprovals } from '../src/mapping-approvals.js';
import { DeliveryService } from '../src/delivery.js';
import {AdminOrders} from '../src/admin-orders.js';
import {StaffAuth,totp,decodeBase32} from '../src/staff-auth.js';

let ctx:Awaited<ReturnType<typeof testDatabase>>,db:Database;
const secret='test-only-secret-which-is-longer-than-32-characters';
let now:Date;
before(async()=>{ctx=await testDatabase();db=ctx.db;});
after(async()=>{await ctx?.stop();});
beforeEach(async()=>{
 await db.pool.query(`TRUNCATE import_runs,products,storefront_mappings,warehouses,users,rate_limits,otp_challenges,
  checkout_sessions,idempotency_records,integration_inbox,integration_outbox RESTART IDENTITY CASCADE`);
 now=new Date('2026-09-06T10:00:00Z');
});
async function seed(stock=10) {
 const userId=randomUUID(),productId=randomUUID(),warehouseId=randomUUID(),quoteId=randomUUID();
 await db.pool.query('INSERT INTO users(id) VALUES($1)',[userId]);
 await db.pool.query("INSERT INTO user_identities(channel,destination,user_id,verified_at) VALUES('email','buyer@example.test',$1,$2)",[userId,now]);
 await db.pool.query("INSERT INTO products(id,sku,name,active,sale_approved) VALUES($1,'TEST-A','Test product',true,true)",[productId]);
 await db.pool.query("INSERT INTO product_prices(product_id,currency,regular_minor,final_minor,approved) VALUES($1,'RUB',60000,50000,true)",[productId]);
 await db.pool.query("INSERT INTO warehouses(id,code,name,active) VALUES($1,'TEST','Test warehouse',true)",[warehouseId]);
 await db.pool.query('INSERT INTO inventory_balances(product_id,warehouse_id,on_hand) VALUES($1,$2,$3)',[productId,warehouseId,stock]);
 const items=[{sku:'TEST-A',quantity:1}];
 await db.pool.query(`INSERT INTO delivery_quotes(id,user_id,warehouse_id,amount_minor,currency,cart_hash,snapshot,expires_at,environment)
  VALUES($1,$2,$3,10000,'RUB',$4,$5,$6,'test')`,[quoteId,userId,warehouseId,cartHash(items),JSON.stringify({method:'test_pickup',label:'Test fixture only'}),new Date(now.getTime()+300_000)]);
 const input:CheckoutInput={items,deliveryQuoteId:quoteId,customer:{name:'Test Buyer',phone:'+79990000000'},consent:{offerVersion:'test-v1',privacyVersion:'test-v1',marketing:false},expectedTotalMinor:60000};
 return {userId,productId,warehouseId,quoteId,input,service:new CommerceService(db,()=>now)};
}
const newKey=()=>randomUUID().replaceAll('-','');
async function packingFixture(){
 const f=await seed(),actor=randomUUID(),productB=randomUUID();
 await db.pool.query("INSERT INTO users(id,role) VALUES($1,'admin')",[actor]);
 await db.pool.query("INSERT INTO products(id,sku,name,active,sale_approved) VALUES($1,'TEST-B','Second product',true,true)",[productB]);
 await db.pool.query("INSERT INTO product_prices(product_id,currency,regular_minor,final_minor,approved) VALUES($1,'RUB',70000,70000,true)",[productB]);
 await db.pool.query('INSERT INTO inventory_balances(product_id,warehouse_id,on_hand) VALUES($1,$2,10)',[productB,f.warehouseId]);
 const items=[{sku:'TEST-A',quantity:2},{sku:'TEST-B',quantity:1}];
 await db.pool.query('UPDATE delivery_quotes SET cart_hash=$2 WHERE id=$1',[f.quoteId,cartHash(items)]);
 const order=await f.service.createCheckout(f.userId,newKey(),{...f.input,items,expectedTotalMinor:180000});
 await f.service.recordPaid({provider:'test',accountId:'test',environment:'test',eventId:'packing-payment',externalPaymentId:'packing-payment',orderId:order.orderId,amountMinor:180000,currency:'RUB'});
 await f.service.adminStartProcessing(actor,order.orderId,{});
 return {...f,actor,order,items};
}
test('customer shipment contains only carrier and tracking, is absent before dispatch and survives completion',async()=>{
 const f=await packingFixture();assert.equal((await f.service.order(f.userId,f.order.orderId)).shipment,null);
 await db.pool.query('UPDATE orders SET delivery_snapshot=$2 WHERE id=$1',[f.order.orderId,JSON.stringify({label:'Доставка СДЭК',address:{city:'Москва',address:'Тестовая улица, 1',internalRoute:'PRIVATE-ROUTE'},providerToken:'PRIVATE-TOKEN',warehouseId:f.warehouseId})]);
 await f.service.adminCompletePacking(f.actor,f.order.orderId,{items:f.items});assert.equal((await f.service.order(f.userId,f.order.orderId)).shipment,null);
 await f.service.adminDispatch(f.actor,f.order.orderId,dispatchInput);
 await f.service.adminCompleteOrder(f.actor,f.order.orderId,completionInput);
 const d=await f.service.order(f.userId,f.order.orderId);
 assert.deepEqual(d.shipment,{carrier:dispatchInput.carrier,trackingNumber:dispatchInput.trackingNumber});assert.equal(d.delivery_status,'delivered');
 assert.deepEqual(Object.keys(d).sort(),['id','public_number','status','payment_status','delivery_status','currency','subtotal_minor','delivery_minor','total_minor','created_at','shipment','canCancel','items','delivery','statusHistory'].sort());
 assert.deepEqual(d.delivery,{label:'Доставка СДЭК',city:'Москва',address:'Тестовая улица, 1'});
 assert.ok(d.statusHistory.some((h:{kind:string;status:string})=>h.kind==='delivery'&&h.status==='delivered'));
 for(const h of d.statusHistory){assert.deepEqual(Object.keys(h).sort(),['kind','occurred_at','status']);assert.ok(Number.isFinite(new Date(h.occurred_at).getTime()));}
 assert.ok(!JSON.stringify(d).includes('PRIVATE-'));assert.ok(!JSON.stringify(d).includes(f.warehouseId));
 assert.ok(!JSON.stringify(d).includes(f.actor));assert.ok(!JSON.stringify(d).includes(completionInput.reason));
 const stranger=randomUUID();await db.pool.query('INSERT INTO users(id) VALUES($1)',[stranger]);
 await assert.rejects(f.service.order(stranger,f.order.orderId),/ORDER_NOT_FOUND/);
 assert.equal((await f.service.orders(stranger)).items.length,0);
});
test('HTTP customer shipment is private, uncached and inaccessible from another buyer session',async()=>{
 const f=await completionFixture(),sender=new MemorySender(),origin='http://127.0.0.1:3200';
 const app=await buildApp({db,otpSecret:secret,otpSender:sender,origin,secureCookies:false});
 try{
  const url='/api/store/v1/orders/'+f.order.orderId;
  assert.equal((await app.inject({url})).statusCode,401);
  async function login(destination:string){const challenge=await app.inject({method:'POST',url:'/api/store/v1/auth/otp/request',headers:{origin},payload:{channel:'email',destination}});assert.equal(challenge.statusCode,200);const v=await app.inject({method:'POST',url:'/api/store/v1/auth/otp/verify',headers:{origin},payload:{challengeId:challenge.json().challengeId,code:sender.messages.at(-1)!.code}});assert.equal(v.statusCode,200);return String(v.headers['set-cookie']).split(';')[0]!;}
  const cookie=await login('buyer@example.test'),own=await app.inject({url,headers:{cookie}});
  assert.equal(own.statusCode,200);assert.equal(own.headers['cache-control'],'no-store');assert.deepEqual(own.json().shipment,{carrier:dispatchInput.carrier,trackingNumber:dispatchInput.trackingNumber});
  for(const key of ['dispatch','packing','completion','history','customer_snapshot','delivery_snapshot'])assert.ok(!(key in own.json()));
  const other=await login('other-shipment@example.test');assert.equal((await app.inject({url,headers:{cookie:other}})).statusCode,404);
 }finally{await app.close();}
});
const completionInput={reason:'Получение подтверждено покупателем',confirmed:true};
async function completionFixture(){const f=await packingFixture();await f.service.adminCompletePacking(f.actor,f.order.orderId,{items:f.items});await f.service.adminDispatch(f.actor,f.order.orderId,dispatchInput);return f;}
test('completion is atomic and idempotent across staff, preserves financial and inventory facts and updates customer history',async()=>{
 const f=await completionFixture(),other=randomUUID();await db.pool.query("INSERT INTO users(id,role) VALUES($1,'admin')",[other]);
 const balances=(await db.pool.query('SELECT * FROM inventory_balances ORDER BY product_id')).rows,payments=(await db.pool.query('SELECT * FROM payments')).rows,movements=await count('inventory_movements');
 await Promise.all([f.actor,other].map(a=>f.service.adminCompleteOrder(a,f.order.orderId,completionInput)));
 await f.service.adminCompleteOrder(other,f.order.orderId,completionInput);
 const d=await new AdminOrders(db).detail(f.actor,f.order.orderId);
 assert.equal(d.status,'completed');assert.equal(d.delivery_status,'delivered');assert.equal(d.payment_status,'paid');assert.equal(d.total_minor,180000);assert.equal(d.completion.reason,completionInput.reason);assert.ok([f.actor,other].includes(d.completion.completedBy));
 assert.deepEqual((await db.pool.query('SELECT * FROM inventory_balances ORDER BY product_id')).rows,balances);assert.deepEqual((await db.pool.query('SELECT * FROM payments')).rows,payments);assert.equal(await count('inventory_movements'),movements);
 assert.equal(await count('order_completion'),1);assert.equal(await count('shipment_events'),1);assert.equal((await db.pool.query('SELECT status FROM shipments')).rows[0].status,'delivered');
 assert.equal((await db.pool.query("SELECT 1 FROM audit_log WHERE action='order.completed'")).rowCount,1);assert.equal((await db.pool.query("SELECT 1 FROM integration_outbox WHERE kind='order.completed'")).rowCount,1);
 assert.equal((await db.pool.query("SELECT 1 FROM order_status_history WHERE status IN ('completed','delivered')")).rowCount,2);
 assert.equal((await f.service.order(f.userId,f.order.orderId)).status,'completed');assert.equal((await f.service.orders(f.userId)).items[0].delivery_status,'delivered');
 assert.equal((await new AdminOrders(db).list(f.actor,{status:'processing'})).items.length,0);assert.equal((await new AdminOrders(db).list(f.actor,{status:'completed'})).items.length,1);
 await assert.rejects(f.service.adminCompleteOrder(other,f.order.orderId,{...completionInput,reason:'Другое основание'}),/COMPLETION_CONFLICT/);
});
test('completion rejects unshipped orders, invalid evidence, inactive staff and inconsistent shipment states',async()=>{
 const f=await packingFixture();await assert.rejects(f.service.adminCompleteOrder(f.actor,f.order.orderId,completionInput),/ORDER_NOT_READY_FOR_COMPLETION/);
 await f.service.adminCompletePacking(f.actor,f.order.orderId,{items:f.items});await f.service.adminDispatch(f.actor,f.order.orderId,dispatchInput);
 for(const input of [{...completionInput,confirmed:false},{...completionInput,reason:'  '},{...completionInput,reason:'x'.repeat(1001)},{...completionInput,completedBy:f.actor}])await assert.rejects(f.service.adminCompleteOrder(f.actor,f.order.orderId,input));
 await assert.rejects(f.service.adminCompleteOrder(f.userId,f.order.orderId,completionInput),/FORBIDDEN/);
 await db.pool.query('UPDATE users SET disabled=true WHERE id=$1',[f.actor]);await assert.rejects(f.service.adminCompleteOrder(f.actor,f.order.orderId,completionInput),/FORBIDDEN/);await db.pool.query('UPDATE users SET disabled=false WHERE id=$1',[f.actor]);
 for(const [status,payment,delivery] of [['draft','pending','not_created'],['cancelled','paid','cancelled'],['processing','refunded','shipped'],['processing','paid','returned']]){
  await db.pool.query('UPDATE orders SET status=$2,payment_status=$3,delivery_status=$4 WHERE id=$1',[f.order.orderId,status,payment,delivery]);await assert.rejects(f.service.adminCompleteOrder(f.actor,f.order.orderId,completionInput),/ORDER_NOT_READY_FOR_COMPLETION/);
 }
 await db.pool.query("UPDATE orders SET status='processing',payment_status='paid',delivery_status='shipped' WHERE id=$1",[f.order.orderId]);
 await db.pool.query("UPDATE shipments SET status='returned'");await assert.rejects(f.service.adminCompleteOrder(f.actor,f.order.orderId,completionInput),/ORDER_NOT_READY_FOR_COMPLETION/);
 await db.pool.query("UPDATE shipments SET status='shipped',environment='production'");await assert.rejects(f.service.adminCompleteOrder(f.actor,f.order.orderId,completionInput),/ORDER_NOT_READY_FOR_COMPLETION/);
 assert.equal(await count('order_completion'),0);assert.equal(await count('shipment_events'),0);
});
test('completion rolls back all state on event failure and allows verified collection from a pickup point',async()=>{
 const f=await completionFixture(),shipment=(await db.pool.query('SELECT id FROM shipments')).rows[0].id;
 const eventId=randomUUID();await db.pool.query("INSERT INTO shipment_events(id,shipment_id,status,occurred_at,external_event_id) VALUES($1,$2,'shipped',$3,$4)",[eventId,shipment,now,`admin:completion:${f.order.orderId}`]);
 await assert.rejects(f.service.adminCompleteOrder(f.actor,f.order.orderId,completionInput));
 assert.equal(await count('order_completion'),0);assert.equal((await f.service.order(f.userId,f.order.orderId)).delivery_status,'shipped');assert.equal((await db.pool.query('SELECT status FROM shipments')).rows[0].status,'shipped');
 assert.equal((await db.pool.query("SELECT 1 FROM audit_log WHERE action='order.completed'")).rowCount,0);assert.equal((await db.pool.query("SELECT 1 FROM integration_outbox WHERE kind='order.completed'")).rowCount,0);
 await db.pool.query('DELETE FROM shipment_events WHERE id=$1',[eventId]);
 await db.pool.query("UPDATE orders SET delivery_status='arrived_to_pickup_point' WHERE id=$1",[f.order.orderId]);await db.pool.query("UPDATE shipments SET status='arrived_to_pickup_point' WHERE id=$1",[shipment]);
 await f.service.adminCompleteOrder(f.actor,f.order.orderId,completionInput);assert.equal((await f.service.order(f.userId,f.order.orderId)).status,'completed');
});
test('HTTP completion protects access, requires evidence and confirmation, and returns the responsible staff member',async()=>{
 const f=await completionFixture(),key='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',password='Test-Completion-Password',origin='http://127.0.0.1:3200';
 const actor=await new StaffAuth(db,secret).provision('completion@example.test',password,key);
 const app=await buildApp({db,otpSecret:secret,staffSecret:secret,otpSender:new DisabledOtpSender(),origin,secureCookies:false});
 try{
  const url='/api/admin/v1/orders/'+f.order.orderId+'/complete',payload=completionInput;
  assert.equal((await app.inject({method:'POST',url,headers:{origin},payload})).statusCode,401);
  const login=await app.inject({method:'POST',url:'/api/admin/v1/auth/login',headers:{origin},payload:{email:'completion@example.test',password,code:totp(decodeBase32(key),Math.floor(Date.now()/30000))}});
  assert.equal(login.statusCode,200);const cookie=String(login.headers['set-cookie']).split(';')[0]!,headers={origin,cookie,'x-csrf-token':login.json().csrfToken};
  assert.equal((await app.inject({method:'POST',url,headers:{origin,cookie},payload})).statusCode,403);assert.equal((await app.inject({method:'POST',url,headers:{...headers,origin:'https://other.test'},payload})).statusCode,403);
  assert.equal((await app.inject({method:'POST',url,headers,payload:{reason:payload.reason}})).statusCode,400);assert.equal((await app.inject({method:'POST',url,headers,payload})).statusCode,200);
  const d=(await app.inject({url:'/api/admin/v1/orders/'+f.order.orderId,headers})).json();assert.equal(d.completion.completedBy,actor);assert.equal(d.status,'completed');assert.equal(d.completion.reason,payload.reason);
 }finally{await app.close();}
});
const dispatchInput={carrier:'Тестовый перевозчик',trackingNumber:'TEST-123',confirmed:true};
test('dispatch consumes all reserved stock exactly once under concurrent staff actions and preserves payment',async()=>{
 const f=await packingFixture(),other=randomUUID();await db.pool.query("INSERT INTO users(id,role) VALUES($1,'admin')",[other]);
 await f.service.adminCompletePacking(f.actor,f.order.orderId,{items:f.items});
 const payment=(await db.pool.query('SELECT * FROM payments')).rows;
 await Promise.all([f.actor,other].map(a=>f.service.adminDispatch(a,f.order.orderId,dispatchInput)));
 await f.service.adminDispatch(other,f.order.orderId,dispatchInput);
 const balances=(await db.pool.query('SELECT p.sku,b.on_hand,b.reserved FROM inventory_balances b JOIN products p ON p.id=b.product_id ORDER BY p.sku')).rows;
 assert.deepEqual(balances,[{sku:'TEST-A',on_hand:8,reserved:0},{sku:'TEST-B',on_hand:9,reserved:0}]);
 assert.equal((await db.pool.query("SELECT 1 FROM inventory_reservations WHERE status='consumed'")).rowCount,2);
 assert.equal((await db.pool.query("SELECT 1 FROM inventory_movements WHERE kind='ship'")).rowCount,2);
 assert.equal(await count('order_dispatch'),1);assert.equal(await count('shipments'),1);
 assert.deepEqual((await db.pool.query('SELECT * FROM payments')).rows,payment);
 const d=await new AdminOrders(db).detail(f.actor,f.order.orderId);
 assert.equal(d.delivery_status,'shipped');assert.equal(d.status,'processing');assert.equal(d.payment_status,'paid');assert.equal(d.total_minor,180000);
 assert.equal(d.dispatch.trackingNumber,'TEST-123');assert.ok([f.actor,other].includes(d.dispatch.dispatchedBy));
 assert.equal((await f.service.order(f.userId,f.order.orderId)).delivery_status,'shipped');
 assert.equal((await db.pool.query("SELECT 1 FROM audit_log WHERE action='order.dispatched'")).rowCount,1);
 assert.equal((await db.pool.query("SELECT 1 FROM integration_outbox WHERE kind='order.dispatched'")).rowCount,1);
 await assert.rejects(f.service.adminDispatch(other,f.order.orderId,{...dispatchInput,trackingNumber:'OTHER'}),/DISPATCH_CONFLICT/);
 await assert.rejects(f.service.cancel(f.userId,f.order.orderId),/CANCELLATION_REQUIRES_REVIEW/);
 assert.equal(await f.service.expire(),0);
 assert.equal((await db.pool.query("SELECT 1 FROM inventory_movements WHERE kind='ship'")).rowCount,2);
});
test('dispatch rejects missing packing, invalid input, inactive staff and inappropriate order states',async()=>{
 const f=await packingFixture();
 await assert.rejects(f.service.adminDispatch(f.actor,f.order.orderId,dispatchInput),/ORDER_NOT_PACKED/);
 await f.service.adminCompletePacking(f.actor,f.order.orderId,{items:f.items});
 for(const input of [{...dispatchInput,confirmed:false},{...dispatchInput,carrier:' '},{...dispatchInput,trackingNumber:'https://example.test'},{...dispatchInput,dispatchedBy:f.actor}])await assert.rejects(f.service.adminDispatch(f.actor,f.order.orderId,input));
 await assert.rejects(f.service.adminDispatch(f.userId,f.order.orderId,dispatchInput),/FORBIDDEN/);
 await db.pool.query('UPDATE users SET disabled=true WHERE id=$1',[f.actor]);
 await assert.rejects(f.service.adminDispatch(f.actor,f.order.orderId,dispatchInput),/FORBIDDEN/);
 await db.pool.query('UPDATE users SET disabled=false WHERE id=$1',[f.actor]);
 for(const [status,payment,delivery] of [['draft','pending','not_created'],['cancelled','paid','cancelled'],['processing','refunded','preparing'],['processing','paid','shipped']]){
  await db.pool.query('UPDATE orders SET status=$2,payment_status=$3,delivery_status=$4 WHERE id=$1',[f.order.orderId,status,payment,delivery]);
  await assert.rejects(f.service.adminDispatch(f.actor,f.order.orderId,dispatchInput),/ORDER_NOT_READY_FOR_DISPATCH/);
 }
 assert.equal(await count('order_dispatch'),0);assert.equal(await count('shipments'),0);
 assert.equal((await db.pool.query("SELECT 1 FROM inventory_movements WHERE kind='ship'")).rowCount,0);
});
test('dispatch rolls back earlier stock changes when a later balance is inconsistent and rejects missing reserves',async()=>{
 const f=await packingFixture();await f.service.adminCompletePacking(f.actor,f.order.orderId,{items:f.items});
 await db.pool.query("UPDATE inventory_reservations SET status='released' WHERE order_id=$1 AND product_id=$2",[f.order.orderId,f.productId]);
 await assert.rejects(f.service.adminDispatch(f.actor,f.order.orderId,dispatchInput),/ORDER_RESERVATION_MISSING/);
 await db.pool.query("UPDATE inventory_reservations SET status='active' WHERE order_id=$1",[f.order.orderId]);
 await db.pool.query("UPDATE inventory_balances SET reserved=0 WHERE product_id=(SELECT id FROM products WHERE sku='TEST-B')");
 const before=(await db.pool.query('SELECT * FROM inventory_balances ORDER BY product_id')).rows;
 await assert.rejects(f.service.adminDispatch(f.actor,f.order.orderId,dispatchInput),/ORDER_RESERVATION_MISSING/);
 assert.deepEqual((await db.pool.query('SELECT * FROM inventory_balances ORDER BY product_id')).rows,before);
 assert.equal((await db.pool.query("SELECT 1 FROM inventory_reservations WHERE status='active'")).rowCount,2);
 assert.equal(await count('order_dispatch'),0);assert.equal(await count('shipments'),0);
 assert.equal((await db.pool.query("SELECT 1 FROM inventory_movements WHERE kind='ship'")).rowCount,0);
 assert.equal((await db.pool.query("SELECT 1 FROM audit_log WHERE action='order.dispatched'")).rowCount,0);
 assert.equal((await f.service.order(f.userId,f.order.orderId)).delivery_status,'preparing');
});
test('HTTP dispatch requires staff, Origin, CSRF and explicit confirmation and exposes saved shipment',async()=>{
 const f=await packingFixture();await f.service.adminCompletePacking(f.actor,f.order.orderId,{items:f.items});
 const key='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',password='Test-Dispatch-Password',origin='http://127.0.0.1:3200';
 const actor=await new StaffAuth(db,secret).provision('dispatch@example.test',password,key);
 const app=await buildApp({db,otpSecret:secret,staffSecret:secret,otpSender:new DisabledOtpSender(),origin,secureCookies:false});
 try{
  const url='/api/admin/v1/orders/'+f.order.orderId+'/dispatch',payload=dispatchInput;
  assert.equal((await app.inject({method:'POST',url,headers:{origin},payload})).statusCode,401);
  const login=await app.inject({method:'POST',url:'/api/admin/v1/auth/login',headers:{origin},payload:{email:'dispatch@example.test',password,code:totp(decodeBase32(key),Math.floor(Date.now()/30000))}});
  assert.equal(login.statusCode,200);const cookie=String(login.headers['set-cookie']).split(';')[0]!,headers={origin,cookie,'x-csrf-token':login.json().csrfToken};
  assert.equal((await app.inject({method:'POST',url,headers:{origin,cookie},payload})).statusCode,403);
  assert.equal((await app.inject({method:'POST',url,headers:{...headers,origin:'https://other.test'},payload})).statusCode,403);
  assert.equal((await app.inject({method:'POST',url,headers,payload:{...payload,confirmed:false}})).statusCode,400);
  assert.equal((await app.inject({method:'POST',url,headers,payload})).statusCode,200);
  const detail=await app.inject({url:'/api/admin/v1/orders/'+f.order.orderId,headers});
  assert.equal(detail.json().dispatch.dispatchedBy,actor);assert.equal(detail.json().delivery_status,'shipped');
 }finally{await app.close();}
});
test('packing confirms every line once under concurrent staff actions without consuming stock or changing payment',async()=>{
 const f=await packingFixture(),other=randomUUID();await db.pool.query("INSERT INTO users(id,role) VALUES($1,'admin')",[other]);
 const balances=(await db.pool.query('SELECT product_id,on_hand,reserved FROM inventory_balances ORDER BY product_id')).rows;
 const movements=await count('inventory_movements'),payments=await count('payments');
 await Promise.all([f.actor,other].map(actor=>f.service.adminCompletePacking(actor,f.order.orderId,{items:f.items})));
 await f.service.adminCompletePacking(other,f.order.orderId,{items:[...f.items].reverse()});
 const rows=(await db.pool.query('SELECT * FROM order_packing WHERE order_id=$1',[f.order.orderId])).rows;
 assert.equal(rows.length,1);assert.deepEqual(rows[0].items,f.items);assert.ok([f.actor,other].includes(rows[0].packed_by));
 const detail=await new AdminOrders(db).detail(f.actor,f.order.orderId);
 assert.equal(detail.packing.packedBy,rows[0].packed_by);assert.equal(detail.status,'processing');assert.equal(detail.payment_status,'paid');assert.equal(detail.delivery_status,'preparing');assert.equal(detail.total_minor,180000);
 assert.deepEqual((await db.pool.query('SELECT product_id,on_hand,reserved FROM inventory_balances ORDER BY product_id')).rows,balances);
 assert.equal(await count('inventory_movements'),movements);assert.equal(await count('payments'),payments);assert.equal(await count('shipments'),0);
 assert.equal((await db.pool.query("SELECT 1 FROM audit_log WHERE entity_id=$1 AND action='order.packing_completed'",[f.order.orderId])).rowCount,1);
 assert.equal((await db.pool.query("SELECT 1 FROM integration_outbox WHERE aggregate_id=$1 AND kind='order.packing_completed'",[f.order.orderId])).rowCount,1);
});
test('packing rejects omitted, extra, duplicate and incorrect counts, including after confirmation',async()=>{
 const f=await packingFixture();
 for(const items of [[],[f.items[0]],f.items.map(i=>({...i,quantity:1})),[...f.items,{sku:'OTHER',quantity:1}],[f.items[0],f.items[0]],f.items.map(i=>({...i,quantity:0}))])
  await assert.rejects(f.service.adminCompletePacking(f.actor,f.order.orderId,{items}));
 assert.equal(await count('order_packing'),0);
 assert.equal((await new AdminOrders(db).detail(f.actor,f.order.orderId)).packing,null);
 await f.service.adminCompletePacking(f.actor,f.order.orderId,{items:f.items});
 await assert.rejects(f.service.adminCompletePacking(f.actor,f.order.orderId,{items:[f.items[0]]}),/PACKING_ITEMS_MISMATCH/);
 assert.equal(await count('order_packing'),1);
});
test('packing requires active staff, paid processing state and a complete reservation',async()=>{
 const f=await packingFixture();
 await assert.rejects(f.service.adminCompletePacking(f.userId,f.order.orderId,{items:f.items}),/FORBIDDEN/);
 await db.pool.query('UPDATE users SET disabled=true WHERE id=$1',[f.actor]);
 await assert.rejects(f.service.adminCompletePacking(f.actor,f.order.orderId,{items:f.items}),/FORBIDDEN/);
 await db.pool.query('UPDATE users SET disabled=false WHERE id=$1',[f.actor]);
 for(const [status,payment,delivery] of [['draft','pending','not_created'],['placed','paid','not_created'],['cancelled','paid','cancelled'],['processing','refunded','preparing'],['processing','paid','shipped']]){
  await db.pool.query('UPDATE orders SET status=$2,payment_status=$3,delivery_status=$4 WHERE id=$1',[f.order.orderId,status,payment,delivery]);
  await assert.rejects(f.service.adminCompletePacking(f.actor,f.order.orderId,{items:f.items}),/ORDER_NOT_READY_FOR_PACKING/);
 }
 await db.pool.query("UPDATE orders SET status='processing',payment_status='paid',delivery_status='preparing' WHERE id=$1",[f.order.orderId]);
 await db.pool.query("UPDATE inventory_reservations SET status='released' WHERE order_id=$1 AND product_id=$2",[f.order.orderId,f.productId]);
 await assert.rejects(f.service.adminCompletePacking(f.actor,f.order.orderId,{items:f.items}),/ORDER_RESERVATION_MISSING/);
 assert.equal(await count('order_packing'),0);
 assert.equal((await db.pool.query("SELECT 1 FROM audit_log WHERE entity_id=$1 AND action='order.packing_completed'",[f.order.orderId])).rowCount,0);
});
test('HTTP packing requires staff, Origin and CSRF, rejects extra fields and persists confirmation',async()=>{
 const f=await packingFixture(),key='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',password='Test-Packing-Password';
 const actor=await new StaffAuth(db,secret).provision('packing@example.test',password,key),origin='http://127.0.0.1:3200';
 const app=await buildApp({db,otpSecret:secret,staffSecret:secret,otpSender:new DisabledOtpSender(),origin,secureCookies:false});
 try{
  const url='/api/admin/v1/orders/'+f.order.orderId+'/complete-packing',payload={items:f.items};
  assert.equal((await app.inject({method:'POST',url,headers:{origin},payload})).statusCode,401);
  const login=await app.inject({method:'POST',url:'/api/admin/v1/auth/login',headers:{origin},payload:{email:'packing@example.test',password,code:totp(decodeBase32(key),Math.floor(Date.now()/30000))}});
  assert.equal(login.statusCode,200);const cookie=String(login.headers['set-cookie']).split(';')[0]!,headers={origin,cookie,'x-csrf-token':login.json().csrfToken};
  assert.equal((await app.inject({method:'POST',url,headers:{origin,cookie},payload})).statusCode,403);
  assert.equal((await app.inject({method:'POST',url,headers:{...headers,origin:'https://other.test'},payload})).statusCode,403);
  assert.equal((await app.inject({method:'POST',url,headers,payload:{...payload,packedBy:actor}})).statusCode,400);
  assert.equal((await app.inject({method:'POST',url,headers,payload})).statusCode,200);
  const detail=await app.inject({url:'/api/admin/v1/orders/'+f.order.orderId,headers});
  assert.equal(detail.json().packing.packedBy,actor);assert.ok(detail.json().packing.packedAt);
 }finally{await app.close();}
});
test('two administrators start processing once, preserving payment, totals and reserved inventory',async()=>{
 const f=await seed(),actors=[randomUUID(),randomUUID()];
 for(const actor of actors)await db.pool.query("INSERT INTO users(id,role) VALUES($1,'admin')",[actor]);
 const order=await f.service.createCheckout(f.userId,newKey(),f.input);
 await f.service.recordPaid({provider:'test',accountId:'test',environment:'test',eventId:'processing-payment',externalPaymentId:'processing-payment',orderId:order.orderId,amountMinor:60000,currency:'RUB'});
 const balance=(await db.pool.query('SELECT on_hand,reserved FROM inventory_balances')).rows;
 const movements=await count('inventory_movements'),payments=await count('payments');
 await Promise.all(actors.map(actor=>f.service.adminStartProcessing(actor,order.orderId,{})));
 await f.service.adminStartProcessing(actors[0]!,order.orderId,{});
 const detail=await f.service.order(f.userId,order.orderId);
 assert.equal(detail.status,'processing');assert.equal(detail.delivery_status,'preparing');assert.equal(detail.payment_status,'paid');assert.equal(detail.total_minor,60000);assert.equal(detail.canCancel,false);
 assert.deepEqual((await db.pool.query('SELECT on_hand,reserved FROM inventory_balances')).rows,balance);
 assert.equal(await count('inventory_movements'),movements);assert.equal(await count('payments'),payments);assert.equal(await count('shipments'),0);
 const audit=(await db.pool.query("SELECT * FROM audit_log WHERE entity_id=$1 AND action='order.processing_started'",[order.orderId])).rows;
 assert.equal(audit.length,1);assert.ok(actors.includes(audit[0].actor_id));
 assert.equal((await db.pool.query("SELECT 1 FROM integration_outbox WHERE aggregate_id=$1 AND kind='order.processing_started'",[order.orderId])).rowCount,1);
 assert.equal((await db.pool.query("SELECT 1 FROM order_status_history WHERE order_id=$1 AND source='admin'",[order.orderId])).rowCount,2);
 now=new Date(now.getTime()+3600000);assert.equal(await f.service.expire(),0);
 await assert.rejects(f.service.cancel(f.userId,order.orderId),/CANCELLATION_REQUIRES_REVIEW/);
});
test('processing rejects unpaid, cancelled, refunded and shipped orders without changing stock',async()=>{
 const f=await seed(),actor=randomUUID();await db.pool.query("INSERT INTO users(id,role) VALUES($1,'admin')",[actor]);
 const order=await f.service.createCheckout(f.userId,newKey(),f.input);
 await assert.rejects(f.service.adminStartProcessing(f.userId,order.orderId,{}),/FORBIDDEN/);
 for(const [status,payment,delivery] of [['draft','pending','not_created'],['cancelled','paid','cancelled'],['placed','refunded','not_created'],['placed','paid','shipped'],['completed','paid','delivered']]){
  await db.pool.query('UPDATE orders SET status=$2,payment_status=$3,delivery_status=$4 WHERE id=$1',[order.orderId,status,payment,delivery]);
  await assert.rejects(f.service.adminStartProcessing(actor,order.orderId,{}),/ORDER_NOT_READY_FOR_PROCESSING/);
 }
 assert.equal((await db.pool.query("SELECT 1 FROM audit_log WHERE entity_id=$1 AND action='order.processing_started'",[order.orderId])).rowCount,0);
 assert.equal((await db.pool.query('SELECT reserved FROM inventory_balances')).rows[0].reserved,1);
 await assert.rejects(f.service.adminStartProcessing(actor,order.orderId,{payment_status:'paid'}));
 await db.pool.query('UPDATE users SET disabled=true WHERE id=$1',[actor]);
 await assert.rejects(f.service.adminStartProcessing(actor,order.orderId,{}),/FORBIDDEN/);
});
test('processing fails closed when an order reservation is incomplete',async()=>{
 const f=await seed(),actor=randomUUID();await db.pool.query("INSERT INTO users(id,role) VALUES($1,'admin')",[actor]);
 const order=await f.service.createCheckout(f.userId,newKey(),f.input);
 await f.service.recordPaid({provider:'test',accountId:'test',environment:'test',eventId:'missing-reserve',externalPaymentId:'missing-reserve',orderId:order.orderId,amountMinor:60000,currency:'RUB'});
 await db.pool.query("UPDATE inventory_reservations SET status='released' WHERE order_id=$1",[order.orderId]);
 await assert.rejects(f.service.adminStartProcessing(actor,order.orderId,{}),/ORDER_RESERVATION_MISSING/);
 assert.equal((await f.service.order(f.userId,order.orderId)).status,'placed');
 assert.equal((await db.pool.query("SELECT 1 FROM integration_outbox WHERE aggregate_id=$1 AND kind='order.processing_started'",[order.orderId])).rowCount,0);
});
test('HTTP processing requires staff, Origin and CSRF and changes the customer-visible status',async()=>{
 const f=await seed(),order=await f.service.createCheckout(f.userId,newKey(),f.input),key='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',password='Test-Processing-Password';
 await f.service.recordPaid({provider:'test',accountId:'test',environment:'test',eventId:'http-processing',externalPaymentId:'http-processing',orderId:order.orderId,amountMinor:60000,currency:'RUB'});
 await new StaffAuth(db,secret).provision('processing@example.test',password,key);
 const origin='http://127.0.0.1:3200',app=await buildApp({db,otpSecret:secret,staffSecret:secret,otpSender:new DisabledOtpSender(),origin,secureCookies:false});
 try{
  const url='/api/admin/v1/orders/'+order.orderId+'/start-processing';
  assert.equal((await app.inject({method:'POST',url,headers:{origin},payload:{}})).statusCode,401);
  const login=await app.inject({method:'POST',url:'/api/admin/v1/auth/login',headers:{origin},payload:{email:'processing@example.test',password,code:totp(decodeBase32(key),Math.floor(Date.now()/30000))}});
  assert.equal(login.statusCode,200);const cookie=String(login.headers['set-cookie']).split(';')[0]!,headers={origin,cookie,'x-csrf-token':login.json().csrfToken};
  assert.equal((await app.inject({method:'POST',url,headers:{origin,cookie},payload:{}})).statusCode,403);
  assert.equal((await app.inject({method:'POST',url,headers:{...headers,origin:'https://other.test'},payload:{}})).statusCode,403);
  assert.equal((await app.inject({method:'POST',url,headers,payload:{}})).statusCode,200);
  assert.equal((await f.service.order(f.userId,order.orderId)).status,'processing');
 }finally{await app.close();}
});
test('admin filters payment and delivery together across stable pages without leaking detail',async()=>{
 const f=await seed(40),actor=randomUUID(),service=new AdminOrders(db),ids:string[]=[];await db.pool.query("INSERT INTO users(id,role) VALUES($1,'admin')",[actor]);
 for(let i=0;i<26;i++)ids.push((await f.service.createCheckout(f.userId,newKey(),f.input)).orderId);
 await db.pool.query("UPDATE orders SET status='processing',payment_status='paid',delivery_status='shipped' WHERE id=ANY($1::uuid[])",[ids.slice(0,22)]);
 const filters={status:'processing',payment:'paid',delivery:'shipped',search:'Test Buyer'};
 const first=await service.list(actor,filters),second=await service.list(actor,{...filters,cursor:first.nextCursor});
 assert.equal(first.items.length,20);assert.equal(second.items.length,2);assert.equal(second.nextCursor,null);
 assert.equal(new Set([...first.items,...second.items].map(i=>i.id)).size,22);
 for(const item of [...first.items,...second.items]){assert.equal(item.payment_status,'paid');assert.equal(item.delivery_status,'shipped');assert.ok(!('customer' in item));}
 assert.equal((await service.list(actor,{payment:'pending',delivery:'not_created'})).items.length,4);
 assert.equal((await service.list(actor,{payment:'pending',delivery:'shipped'})).items.length,0);
 for(const q of [{payment:'invalid'},{delivery:'invalid'},{payment:['paid','pending']}])await assert.rejects(service.list(actor,q));
 await assert.rejects(service.list(f.userId,filters),/FORBIDDEN/);
});
test('admin searches tracking literally and combines it with current delivery status',async()=>{
 const f=await completionFixture(),service=new AdminOrders(db);
 const query={search:'test-123',payment:'paid',delivery:'shipped'};
 assert.equal((await service.list(f.actor,query)).items[0].id,f.order.orderId);
 for(const search of ['%','_','NO-SUCH-TRACKING'])assert.equal((await service.list(f.actor,{search})).items.length,0);
 assert.equal((await service.list(f.actor,{...query,payment:'pending'})).items.length,0);
 await f.service.adminCompleteOrder(f.actor,f.order.orderId,completionInput);
 assert.equal((await service.list(f.actor,query)).items.length,0);
 assert.equal((await service.list(f.actor,{...query,delivery:'delivered'})).items[0].id,f.order.orderId);
});
test('admin order search, detail privacy and stable pagination cover multiple customers',async()=>{
 const f=await seed(50),actor=randomUUID();await db.pool.query("INSERT INTO users(id,role) VALUES($1,'admin')",[actor]);
 const service=new AdminOrders(db),ids=[];
 for(let i=0;i<22;i++)ids.push((await f.service.createCheckout(f.userId,newKey(),f.input)).orderId);
 await assert.rejects(service.list(f.userId,{}),/FORBIDDEN/);
 const page=await service.list(actor,{});assert.equal(page.items.length,20);assert.ok(page.nextCursor);
 const tail=await service.list(actor,{cursor:page.nextCursor});assert.equal(tail.items.length,2);assert.equal(new Set([...page.items,...tail.items].map(r=>r.id)).size,22);
 assert.equal((await service.list(actor,{search:'Test Buyer',status:'draft'})).items.length,20);
 assert.equal((await service.list(actor,{search:'%',status:''})).items.length,0);
 assert.equal((await service.list(actor,{status:'cancelled'})).items.length,0);
 const detail=await service.detail(actor,ids[0]!);assert.equal(detail.customer.phone,'+79990000000');assert.equal(detail.total_minor,60000);assert.equal(detail.delivery.label,'Test fixture only');
 assert.ok(!('verifiedContacts' in detail.customer));assert.ok(!('customer' in page.items[0]!));
 await db.pool.query('UPDATE users SET disabled=true WHERE id=$1',[actor]);await assert.rejects(service.detail(actor,ids[0]!),/FORBIDDEN/);
});
test('admin cancellation is atomic with buyer cancellation and refuses a paid order',async()=>{
 const f=await seed(),actor=randomUUID();await db.pool.query("INSERT INTO users(id,role) VALUES($1,'admin')",[actor]);
 const first=await f.service.createCheckout(f.userId,newKey(),f.input);
 await assert.rejects(f.service.adminCancel(f.userId,first.orderId,{reason:'Test'}),/FORBIDDEN/);
 await assert.rejects(f.service.adminCancel(actor,first.orderId,{reason:' '}));
 await Promise.all([f.service.adminCancel(actor,first.orderId,{reason:'Просьба покупателя'}),f.service.cancel(f.userId,first.orderId)]);
 assert.equal((await db.pool.query("SELECT * FROM inventory_movements WHERE order_id=$1 AND kind='release'",[first.orderId])).rowCount,1);
 const second=await f.service.createCheckout(f.userId,newKey(),f.input);
 await f.service.recordPaid({provider:'test',accountId:'test',environment:'test',eventId:'paid',externalPaymentId:'paid',orderId:second.orderId,amountMinor:60000,currency:'RUB'});
 await assert.rejects(f.service.adminCancel(actor,second.orderId,{reason:'Просьба покупателя'}),/CANCELLATION_REQUIRES_REVIEW/);
 assert.equal((await db.pool.query('SELECT reserved FROM inventory_balances')).rows[0].reserved,1);
 assert.ok((await new AdminOrders(db).detail(actor,second.orderId)).history.some((h:{action:string})=>h.action==='status.payment.paid'));
});
test('HTTP admin orders protect personal data and record cancellation actor and reason exactly once',async()=>{
 const f=await seed(),order=await f.service.createCheckout(f.userId,newKey(),f.input),key='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',password='Test-Admin-Orders-Password';
 const actor=await new StaffAuth(db,secret).provision('orders-admin@example.test',password,key),origin='http://127.0.0.1:3200';
 const app=await buildApp({db,otpSecret:secret,staffSecret:secret,otpSender:new DisabledOtpSender(),origin,secureCookies:false});
 try{
  const url='/api/admin/v1/orders/'+order.orderId;
  assert.equal((await app.inject({url})).statusCode,401);
  const login=await app.inject({method:'POST',url:'/api/admin/v1/auth/login',headers:{origin},payload:{email:'orders-admin@example.test',password,code:totp(decodeBase32(key),Math.floor(Date.now()/30000))}});
  assert.equal(login.statusCode,200);const cookie=String(login.headers['set-cookie']).split(';')[0]!,headers={origin,cookie,'x-csrf-token':login.json().csrfToken};
  assert.equal((await app.inject({url,headers})).json().customer.name,'Test Buyer');
  assert.equal((await app.inject({method:'POST',url:url+'/cancel',headers:{origin,cookie},payload:{reason:'Test reason'}})).statusCode,403);
  assert.equal((await app.inject({method:'POST',url:url+'/cancel',headers:{...headers,origin:'https://other.test'},payload:{reason:'Test reason'}})).statusCode,403);
  for(let i=0;i<2;i++)assert.equal((await app.inject({method:'POST',url:url+'/cancel',headers,payload:{reason:'Test reason'}})).statusCode,200);
  const audit=(await db.pool.query("SELECT * FROM audit_log WHERE entity_id=$1 AND action='order.cancelled'",[order.orderId])).rows;
  assert.equal(audit.length,1);assert.equal(audit[0].actor_id,actor);assert.equal(audit[0].detail.reason,'Test reason');
  assert.equal((await app.inject({url,headers})).json().canCancel,false);
 }finally{await app.close();}
});
test('disabled and malformed delivery providers create no quote or order',async()=>{
 const f=await seed(),input={items:f.input.items,address:{city:'Test city',address:'Test street 1'}};
 await assert.rejects(new DeliveryService(db).quote(f.userId,input),/DELIVERY_UNAVAILABLE/);
 const bad=new DeliveryService(db,{async quote(){return {warehouseId:f.warehouseId,amountMinor:-1,currency:'RUB',label:'Invalid',expiresInSeconds:300};}});
 await assert.rejects(bad.quote(f.userId,input),/DELIVERY_UNAVAILABLE/);
 assert.equal(await count('delivery_quotes'),1);assert.equal(await count('orders'),0);
});
test('delivery uses provider amount, binds address and cart, rejects browser tariff and stale quotes',async()=>{
 const f=await seed();let calls=0;
 const delivery=new DeliveryService(db,{async quote(input){calls++;assert.deepEqual(input.address,{city:'Test city',address:'Street 1'});
  assert.equal(input.items[0]!.sku,'TEST-A');return {warehouseId:f.warehouseId,amountMinor:12345,currency:'RUB',label:'Fixture only',expiresInSeconds:300};}},()=>now);
 const input={items:f.input.items,address:{city:' Test city ',address:'Street 1'}};
 await assert.rejects(delivery.quote(f.userId,{...input,amountMinor:0}));assert.equal(calls,0);
 const q=await delivery.quote(f.userId,input);assert.equal(q.amountMinor,12345);
 const row=(await db.pool.query('SELECT * FROM delivery_quotes WHERE id=$1',[q.deliveryQuoteId])).rows[0];
 assert.equal(row.user_id,f.userId);assert.equal(row.cart_hash,cartHash(f.input.items));assert.equal(row.snapshot.address.city,'Test city');
 assert.equal((await db.pool.query('SELECT reserved FROM inventory_balances')).rows[0].reserved,0);
 now=new Date(now.getTime()+301000);
 await assert.rejects(f.service.createCheckout(f.userId,newKey(),{...f.input,deliveryQuoteId:q.deliveryQuoteId,expectedTotalMinor:62345}),/INVALID_DELIVERY_QUOTE/);
});
test('checkout result recovery is user scoped and survives simultaneous replay',async()=>{
 const f=await seed(),key=newKey();
 await assert.rejects(f.service.checkoutByKey(f.userId,key),/CHECKOUT_NOT_FOUND/);
 const created=await f.service.createCheckout(f.userId,key,f.input);
 const results=await Promise.all([f.service.checkoutByKey(f.userId,key),f.service.createCheckout(f.userId,key,f.input)]);
 assert.deepEqual(results,[created,created]);
 await assert.rejects(f.service.checkoutByKey(randomUUID(),key),/CHECKOUT_NOT_FOUND/);
 assert.equal(await count('orders'),1);
});
test('HTTP delivery and checkout require CSRF and persist one recoverable order',async()=>{
 const f=await seed(),sender=new MemorySender(),origin='http://127.0.0.1:3200';
 const app=await buildApp({db,otpSecret:secret,otpSender:sender,origin,secureCookies:false,deliveryProvider:{
  async quote(){return {warehouseId:f.warehouseId,amountMinor:15000,currency:'RUB',label:'Test delivery',expiresInSeconds:300};}}});
 try{
  const url='/api/store/v1/delivery/quotes',payload={items:f.input.items,address:{city:'Test city',address:'Test street 1'}};
  assert.equal((await app.inject({method:'POST',url,headers:{origin},payload})).statusCode,401);
  const req=await app.inject({method:'POST',url:'/api/store/v1/auth/otp/request',headers:{origin},payload:{channel:'email',destination:'buyer@example.test'}});
  const verified=await app.inject({method:'POST',url:'/api/store/v1/auth/otp/verify',headers:{origin},payload:{challengeId:req.json().challengeId,code:sender.messages.at(-1)!.code}});
  const cookie=String(verified.headers['set-cookie']).split(';')[0]!;
  assert.equal((await app.inject({method:'POST',url,headers:{origin,cookie},payload})).statusCode,403);
  const headers={origin,cookie,'x-csrf-token':verified.json().csrfToken,'idempotency-key':newKey()};
  const q=await app.inject({method:'POST',url,headers,payload});assert.equal(q.statusCode,200);
  const body={...f.input,deliveryQuoteId:q.json().deliveryQuoteId,expectedTotalMinor:65000};
  const created=await app.inject({method:'POST',url:'/api/store/v1/checkouts',headers,payload:body});assert.equal(created.statusCode,201);
  const replay=await app.inject({method:'POST',url:'/api/store/v1/checkouts',headers,payload:body});assert.deepEqual(replay.json(),created.json());
  const recovered=await app.inject({url:'/api/store/v1/checkouts/by-key/'+headers['idempotency-key'],headers:{cookie}});assert.deepEqual(recovered.json(),created.json());
  const detail=await app.inject({url:'/api/store/v1/orders/'+created.json().orderId,headers:{cookie}});assert.equal(detail.json().delivery_minor,15000);
  assert.equal(await count('orders'),1);assert.equal((await db.pool.query('SELECT delivery_snapshot FROM orders')).rows[0].delivery_snapshot.address.address,'Test street 1');
 }finally{await app.close();}
});
async function count(table:string){return Number((await db.pool.query(`SELECT count(*) AS n FROM ${table}`)).rows[0].n);}
class MemorySender implements OtpSender {
 messages:Parameters<OtpSender['sendOtp']>[0][]=[];
 async sendOtp(value:Parameters<OtpSender['sendOtp']>[0]){this.messages.push(value);}
}
function paid(orderId:string){return {provider:'test',accountId:'test-shop',environment:'test' as const,eventId:'event-1',externalPaymentId:'payment-1',orderId,amountMinor:60000,currency:'RUB' as const};}

test('server totals, immutable snapshots and replay of ten simultaneous identical requests',async()=>{
 const f=await seed(); const key=newKey();
 const results=await Promise.all(Array.from({length:10},()=>f.service.createCheckout(f.userId,key,f.input)));
 assert.ok(results.every(r=>r.orderId===results[0]!.orderId));assert.equal(await count('orders'),1);
 assert.equal((await db.pool.query('SELECT reserved FROM inventory_balances')).rows[0].reserved,1);
 await db.pool.query("UPDATE products SET name='Changed'; UPDATE product_prices SET final_minor=40000");
 const old=await f.service.order(f.userId,results[0]!.orderId);
 assert.equal(old.items[0].name_snapshot,'Test product');assert.equal(old.items[0].unit_minor,50000);
 assert.equal((await f.service.createCheckout(f.userId,key,f.input)).totalMinor,60000);
 await assert.rejects(f.service.createCheckout(f.userId,key,{...f.input,customer:{...f.input.customer,name:'Another'}}),/IDEMPOTENCY_CONFLICT/);
});
test('only one concurrent buyer reserves the last unit',async()=>{
 const f=await seed(1);
 const result=await Promise.allSettled([f.service.createCheckout(f.userId,newKey(),f.input),f.service.createCheckout(f.userId,newKey(),f.input)]);
 assert.equal(result.filter(x=>x.status==='fulfilled').length,1);
 assert.equal(await count('orders'),1);assert.equal(await count('inventory_reservations'),1);
 assert.equal((await db.pool.query('SELECT on_hand,reserved FROM inventory_balances')).rows[0].reserved,1);
});
test('rejects browser prices, invalid quantities, stale totals and inactive products atomically',async()=>{
 const f=await seed();
 for(const input of [{...f.input,price:1},{...f.input,items:[{sku:'TEST-A',quantity:-1}]},{...f.input,expectedTotalMinor:1}]) await assert.rejects(f.service.createCheckout(f.userId,newKey(),input));
 await db.pool.query('UPDATE products SET active=false');
 await assert.rejects(f.service.createCheckout(f.userId,newKey(),f.input),/PRODUCT_UNAVAILABLE/);
 assert.equal(await count('orders'),0);assert.equal(await count('checkout_sessions'),0);
 assert.equal((await db.pool.query('SELECT reserved FROM inventory_balances')).rows[0].reserved,0);
});
test('delivery quote must match buyer, cart, environment and expiry',async()=>{
 const f=await seed();
 for(const mutation of ["UPDATE delivery_quotes SET user_id=NULL","UPDATE delivery_quotes SET cart_hash='bad'","UPDATE delivery_quotes SET environment='production'","UPDATE delivery_quotes SET expires_at='2020-01-01'"]) {
  await db.pool.query(mutation);
  await assert.rejects(f.service.createCheckout(f.userId,newKey(),f.input),/INVALID_DELIVERY_QUOTE/);
  await db.pool.query("UPDATE delivery_quotes SET user_id=$1,cart_hash=$2,environment='test',expires_at=$3",[f.userId,cartHash(f.input.items),new Date(now.getTime()+300_000)]);
 }
 assert.equal(await count('orders'),0);
});
test('multi-item shortage rolls the entire checkout back',async()=>{
 const f=await seed();f.input.items.push({sku:'UNKNOWN',quantity:1});
 await db.pool.query('UPDATE delivery_quotes SET cart_hash=$1',[cartHash(f.input.items)]);
 await assert.rejects(f.service.createCheckout(f.userId,newKey(),f.input),/PRODUCT_UNAVAILABLE/);
 assert.equal(await count('orders'),0);assert.equal((await db.pool.query('SELECT reserved FROM inventory_balances')).rows[0].reserved,0);
});
test('catalog uses approved SKU mappings and server prices without deriving visibility from price approval',async()=>{
 const f=await seed();
 assert.deepEqual(await f.service.catalog(),[]);
 await db.pool.query(`INSERT INTO storefront_mappings(slug,candidate_sku,product_id,confidence,reason)
  VALUES('hair-shampoo','TEST-A',$1,'high','test fixture')`,[f.productId]);
 assert.deepEqual(await f.service.catalog(),[]);
 await db.pool.query("UPDATE storefront_mappings SET approved=true WHERE slug='hair-shampoo'");
 const catalog=await f.service.catalog();
 assert.equal(catalog.length,1);assert.equal(catalog[0]!.slug,'hair-shampoo');
 assert.equal(catalog[0]!.finalMinor,50000);assert.equal(catalog[0]!.regularMinor,60000);assert.equal(catalog[0]!.available,10);
 await db.pool.query('UPDATE product_prices SET approved=false');
 assert.deepEqual(await f.service.catalog(),catalog);
 // The historical checkout price gate remains enforced independently of visibility.
 await assert.rejects(f.service.createCheckout(f.userId,newKey(),f.input),/PRODUCT_UNAVAILABLE/);
});

test('order access is scoped to the verified user',async()=>{
 const f=await seed();const o=await f.service.createCheckout(f.userId,newKey(),f.input);
 await assert.rejects(f.service.order(randomUUID(),o.orderId),/ORDER_NOT_FOUND/);
 await assert.rejects(f.service.cancel(randomUUID(),o.orderId),/ORDER_NOT_FOUND/);
 assert.equal((await f.service.order(f.userId,o.orderId)).status,'draft');
});
test('order pagination is stable for equal timestamps and never accepts another user cursor',async()=>{
 const f=await seed();const created=[];
 for(let i=0;i<4;i++)created.push(await f.service.createCheckout(f.userId,newKey(),f.input));
 const other=randomUUID();await db.pool.query('INSERT INTO users(id) VALUES($1)',[other]);
 await db.pool.query('UPDATE orders SET user_id=$2 WHERE id=$1',[created[3]!.orderId,other]);
 const first=await f.service.orders(f.userId,{limit:2});assert.equal(first.items.length,2);assert.ok(first.nextCursor);
 now=new Date(now.getTime()+1000);const newer=await f.service.createCheckout(f.userId,newKey(),f.input);
 const second=await f.service.orders(f.userId,{limit:2,cursor:first.nextCursor});
 assert.equal(second.items.length,1);assert.equal(second.nextCursor,null);
 const ids=[...first.items,...second.items].map(item=>item.id);
 assert.equal(new Set(ids).size,3);assert.ok(!ids.includes(newer.orderId));assert.ok(!ids.includes(created[3]!.orderId));
 await assert.rejects(f.service.orders(f.userId,{cursor:created[3]!.orderId}),/INVALID_ORDER_CURSOR/);
 await assert.rejects(f.service.orders(f.userId,{limit:51}));
 assert.equal((await f.service.orders(other)).items.length,1);
 assert.deepEqual(await f.service.orders(randomUUID()),{items:[],nextCursor:null});
});

test('HTTP order history requires a session and cancellation requires its CSRF token',async()=>{
 const f=await seed();const order=await f.service.createCheckout(f.userId,newKey(),f.input);
 const sender=new MemorySender();const origin='http://127.0.0.1:3200';
 const app=await buildApp({db,otpSecret:secret,otpSender:sender,origin,secureCookies:false});
 try {
  assert.equal((await app.inject({url:'/api/store/v1/orders'})).statusCode,401);
  const req=await app.inject({method:'POST',url:'/api/store/v1/auth/otp/request',headers:{origin},payload:{channel:'email',destination:'buyer@example.test'}});
  const verified=await app.inject({method:'POST',url:'/api/store/v1/auth/otp/verify',headers:{origin},payload:{challengeId:req.json().challengeId,code:sender.messages.at(-1)!.code}});
  assert.equal(verified.statusCode,200);const cookie=String(verified.headers['set-cookie']).split(';')[0]!;
  const history=await app.inject({url:'/api/store/v1/orders',headers:{cookie}});
  assert.equal(history.statusCode,200);assert.equal(history.json().items[0].id,order.orderId);
  assert.equal(history.headers['cache-control'],'no-store');assert.ok(!('customer_snapshot' in history.json().items[0]));
  assert.equal((await app.inject({url:`/api/store/v1/orders?user_id=${randomUUID()}`,headers:{cookie}})).statusCode,400);
  const detail=await app.inject({url:`/api/store/v1/orders/${order.orderId}`,headers:{cookie}});
  assert.equal(detail.json().subtotal_minor,50000);assert.equal(detail.json().delivery_minor,10000);assert.equal(detail.json().canCancel,true);
  const url=`/api/store/v1/orders/${order.orderId}/cancel`;
  assert.equal((await app.inject({method:'POST',url,headers:{origin,cookie}})).statusCode,403);
  assert.equal((await f.service.order(f.userId,order.orderId)).status,'draft');
  const headers={origin,cookie,'x-csrf-token':verified.json().csrfToken};
  assert.equal((await app.inject({method:'POST',url,headers})).statusCode,200);
  assert.equal((await app.inject({method:'POST',url,headers})).statusCode,200);
  const cancelled=await f.service.order(f.userId,order.orderId);assert.equal(cancelled.canCancel,false);assert.equal(cancelled.status,'cancelled');
  assert.equal((await db.pool.query('SELECT reserved FROM inventory_balances')).rows[0].reserved,0);
 } finally {await app.close();}
});

test('repeated cancellation releases inventory once',async()=>{
 const f=await seed();const o=await f.service.createCheckout(f.userId,newKey(),f.input);
 await Promise.all([f.service.cancel(f.userId,o.orderId),f.service.cancel(f.userId,o.orderId)]);
 assert.equal((await db.pool.query('SELECT reserved FROM inventory_balances')).rows[0].reserved,0);
 assert.equal(Number((await db.pool.query("SELECT count(*) n FROM inventory_movements WHERE kind='release'")).rows[0].n),1);
 assert.equal((await f.service.order(f.userId,o.orderId)).status,'cancelled');
});
test('expiry releases stock and a late payment is preserved for review without reviving the order',async()=>{
 const f=await seed();const o=await f.service.createCheckout(f.userId,newKey(),f.input);
 now=new Date(now.getTime()+3601_000);
 assert.equal(await f.service.expire(),1);assert.equal(await f.service.expire(),0);
 await f.service.recordPaid(paid(o.orderId));
 const order=await f.service.order(f.userId,o.orderId);
 assert.equal(order.status,'cancelled');assert.equal(order.payment_status,'paid');
 assert.equal((await db.pool.query('SELECT reserved FROM inventory_balances')).rows[0].reserved,0);
 const kinds=(await db.pool.query('SELECT kind FROM integration_outbox')).rows.map(r=>r.kind);
 assert.ok(kinds.includes('payment.late_review'));assert.ok(!kinds.includes('order.paid'));
});
test('payment amount, environment, duplicates and reordered delivery are controlled',async()=>{
 const f=await seed();const o=await f.service.createCheckout(f.userId,newKey(),f.input);const e=paid(o.orderId);
 await assert.rejects(f.service.recordPaid({...e,amountMinor:1}),/PAYMENT_AMOUNT_MISMATCH/);
 await assert.rejects(f.service.recordPaid({...e,environment:'production'}),/ENVIRONMENT_MISMATCH/);
 assert.equal(await count('payments'),0);
 await Promise.all([f.service.recordPaid(e),f.service.recordPaid(e)]);
 await f.service.recordPaid({...e,eventId:'retry-another-event'});
 assert.equal(await count('payments'),1);
 await assert.rejects(f.service.recordPaid({...e,amountMinor:1}),/EVENT_CONFLICT/);
 await assert.rejects(f.service.recordPaid({...e,eventId:'another',externalPaymentId:'another-payment'}),/SECOND_PAYMENT_REQUIRES_REVIEW/);
 await assert.rejects(f.service.cancel(f.userId,o.orderId),/CANCELLATION_REQUIRES_REVIEW/);
 now=new Date(now.getTime()+7200_000);assert.equal(await f.service.expire(),0);
 assert.equal((await f.service.order(f.userId,o.orderId)).payment_status,'paid');
});
test('payment success promotes a stored pending payment and rejects mismatched stored amounts',async()=>{
 const f=await seed(),o=await f.service.createCheckout(f.userId,newKey(),f.input),e=paid(o.orderId),id=randomUUID();
 await db.pool.query("INSERT INTO payments(id,order_id,provider,account_id,environment,external_id,status,amount_minor,currency) VALUES($1,$2,$3,$4,$5,$6,'pending',1,'RUB')",[id,o.orderId,e.provider,e.accountId,e.environment,e.externalPaymentId]);
 await assert.rejects(f.service.recordPaid(e),/PAYMENT_AMOUNT_MISMATCH/);
 assert.equal(await count('integration_inbox'),0);assert.equal((await f.service.order(f.userId,o.orderId)).payment_status,'pending');
 await db.pool.query('UPDATE payments SET amount_minor=$2 WHERE id=$1',[id,e.amountMinor]);
 await Promise.all([f.service.recordPaid(e),f.service.recordPaid({...e,eventId:'second-notification'})]);
 assert.equal(await count('payments'),1);assert.equal((await db.pool.query('SELECT status FROM payments')).rows[0].status,'paid');
 assert.equal((await f.service.order(f.userId,o.orderId)).payment_status,'paid');
 assert.equal((await db.pool.query("SELECT 1 FROM order_status_history WHERE kind='payment' AND status='paid'")).rowCount,1);
});

test('delayed payment success preserves full and partial refunds without new financial or stock effects',async()=>{
 const f=await seed(),o=await f.service.createCheckout(f.userId,newKey(),f.input),e=paid(o.orderId);
 await f.service.recordPaid(e);
 const movements=await count('inventory_movements'),outbox=await count('integration_outbox'),history=await count('order_status_history');
 for(const status of ['partially_refunded','refunded']){
  await db.pool.query('UPDATE payments SET status=$1',[status]);await db.pool.query('UPDATE orders SET payment_status=$1 WHERE id=$2',[status,o.orderId]);
  const replay={...e,eventId:'delayed-'+status};await Promise.all([f.service.recordPaid(replay),f.service.recordPaid(replay)]);
  assert.equal((await f.service.order(f.userId,o.orderId)).payment_status,status);
  assert.equal((await db.pool.query('SELECT status FROM payments')).rows[0].status,status);
  await assert.rejects(f.service.recordPaid({...e,eventId:'new-'+status,externalPaymentId:'new-payment'}),/SECOND_PAYMENT_REQUIRES_REVIEW/);
 }
 assert.equal(await count('payments'),1);assert.equal(await count('inventory_movements'),movements);assert.equal(await count('integration_outbox'),outbox);assert.equal(await count('order_status_history'),history);
});

test('two pre-created payment attempts cannot both settle one order',async()=>{
 const f=await seed(),o=await f.service.createCheckout(f.userId,newKey(),f.input),e=paid(o.orderId);
 const events=[e,{...e,eventId:'attempt-2',externalPaymentId:'attempt-2'}];
 for(const p of events)await db.pool.query("INSERT INTO payments(id,order_id,provider,account_id,environment,external_id,status,amount_minor,currency) VALUES($1,$2,$3,$4,$5,$6,'pending',$7,'RUB')",[randomUUID(),o.orderId,p.provider,p.accountId,p.environment,p.externalPaymentId,p.amountMinor]);
 const result=await Promise.allSettled(events.map(p=>f.service.recordPaid(p)));
 assert.equal(result.filter(r=>r.status==='fulfilled').length,1);
 const failure=result.find(r=>r.status==='rejected');assert.ok(failure?.status==='rejected');assert.match(String(failure.reason),/SECOND_PAYMENT_REQUIRES_REVIEW/);
 assert.equal((await db.pool.query("SELECT 1 FROM payments WHERE status='paid'")).rowCount,1);assert.equal(await count('integration_inbox'),1);
});

test('OTP limits persist after failed verification and codes are single use',async()=>{
 const sender=new MemorySender();const auth=new AuthService(db,secret,sender,()=>now);
 const ch=await auth.request('email',' User@Example.test ','127.0.0.1');const code=sender.messages[0]!.code;
 assert.equal(sender.messages[0]!.destination,'user@example.test');
 assert.ok(!JSON.stringify(ch).includes('code'));
 const saved=(await db.pool.query('SELECT * FROM otp_challenges')).rows[0];assert.notEqual(saved.code_mac,code);
 await assert.rejects(auth.request('email','user@example.test','127.0.0.1'),/OTP_COOLDOWN/);
 const wrong=code==='000000'?'111111':'000000';
 for(let i=0;i<5;i++)await assert.rejects(auth.verify(ch.challengeId,wrong,'127.0.0.1'),/INVALID_OTP/);
 await assert.rejects(auth.verify(ch.challengeId,code,'127.0.0.1'),/INVALID_OTP/);
 assert.equal((await db.pool.query('SELECT attempts FROM otp_challenges')).rows[0].attempts,5);
 now=new Date(now.getTime()+61_000);
 const second=await auth.request('email','user@example.test','127.0.0.1');
 const session=await auth.verify(second.challengeId,sender.messages[1]!.code,'127.0.0.1');
 await assert.rejects(auth.verify(second.challengeId,sender.messages[1]!.code,'127.0.0.1'),/INVALID_OTP/);
 assert.equal((await auth.session(session.token)).id,session.user.id);
 await auth.logout(session.token);await assert.rejects(auth.session(session.token),/UNAUTHENTICATED/);
});
test('expired OTP and unavailable providers cannot authenticate',async()=>{
 const sender=new MemorySender();const auth=new AuthService(db,secret,sender,()=>now);
 const ch=await auth.request('sms','+79990000000','ip-1');now=new Date(now.getTime()+301_000);
 await assert.rejects(auth.verify(ch.challengeId,sender.messages[0]!.code,'ip-1'),/INVALID_OTP/);
 const disabled=new AuthService(db,secret,new DisabledOtpSender(),()=>now);
 await assert.rejects(disabled.request('email','fail@example.test','ip-2'),/OTP_DELIVERY_UNAVAILABLE/);
 assert.equal(await count('users'),0);
});
test('customer OTP does not grant staff access',async()=>{
 const sender=new MemorySender();const auth=new AuthService(db,secret,sender,()=>now);
 const ch=await auth.request('email','staff@example.test','ip');
 const userId=randomUUID();await db.pool.query("INSERT INTO users(id,role) VALUES($1,'admin')",[userId]);
 await db.pool.query("INSERT INTO user_identities(channel,destination,user_id,verified_at) VALUES('email','staff@example.test',$1,$2)",[userId,now]);
 await assert.rejects(auth.verify(ch.challengeId,sender.messages[0]!.code,'ip'),/INVALID_OTP/);
 assert.equal(await count('auth_sessions'),0);
});
test('HTTP auth cookies, origin, CSRF, logout and disabled YCP payment callback',async()=>{
 const sender=new MemorySender();const origin='https://shop.example.test';
 const app=await buildApp({db,otpSecret:secret,otpSender:sender,origin,secureCookies:true});
 try {
  assert.equal((await app.inject({method:'POST',url:'/api/store/v1/auth/otp/request',payload:{channel:'email',destination:'a@example.test'}})).statusCode,403);
  const req=await app.inject({method:'POST',url:'/api/store/v1/auth/otp/request',headers:{origin},payload:{channel:'email',destination:'a@example.test'}});
  assert.equal(req.statusCode,200);
  const verified=await app.inject({method:'POST',url:'/api/store/v1/auth/otp/verify',headers:{origin},payload:{challengeId:req.json().challengeId,code:sender.messages[0]!.code}});
  assert.equal(verified.statusCode,200);const header=String(verified.headers['set-cookie']);
  assert.match(header,/HttpOnly/);assert.match(header,/Secure/);assert.match(header,/SameSite=Strict/i);
  assert.ok(!('token' in verified.json()));const cookies=header.split(';')[0]!;
  assert.equal((await app.inject({url:'/api/store/v1/auth/me',headers:{cookie:cookies}})).statusCode,200);
  const ycpApp=await buildApp({db,otpSecret:secret,otpSender:sender,origin,secureCookies:true,
   ycp:{token:'ycp-browser-isolation-'+'y'.repeat(32),settings:{accountId:'browser-isolation',environment:'test',publicOrigin:origin,priceUnit:null,vat:null,warehouses:[]}}});
  try{
   assert.equal((await ycpApp.inject({url:'/api/store/v1/auth/me',headers:{cookie:cookies}})).statusCode,200);
   for(const base of ['/api/v1','/api/ycp/v1']){
    const callback=await ycpApp.inject({method:'POST',url:base+'/checkout/placed',headers:{origin,cookie:cookies,'x-csrf-token':verified.json().csrfToken},payload:{payment_method:'online'}});
    assert.equal(callback.statusCode,401);assert.equal(callback.json().error,'UNAUTHORIZED');
   }
   assert.equal(await count('payments'),0);
  }finally{await ycpApp.close();}
  assert.equal((await app.inject({method:'POST',url:'/api/store/v1/auth/logout',headers:{origin,cookie:cookies}})).statusCode,403);
  assert.equal((await app.inject({method:'POST',url:'/api/store/v1/auth/logout',headers:{origin,cookie:cookies,'x-csrf-token':verified.json().csrfToken}})).statusCode,200);
  assert.equal((await app.inject({url:'/api/store/v1/auth/me',headers:{cookie:cookies}})).statusCode,401);
  // This is now an official authenticated YCP route. Without YCP settings it
  // must reject the request explicitly, before any payment or order mutation.
  const callback=await app.inject({method:'POST',url:'/api/v1/checkout/placed',headers:{origin},payload:{payment_method:'online'}});
  assert.equal(callback.statusCode,503);assert.equal(callback.json().error,'YCP_UNAVAILABLE');
  assert.equal(await count('payments'),0);
  assert.equal((await app.inject({url:'/health/ready'})).statusCode,200);
 }finally{await app.close();}
});
test('restored sessions recover stable CSRF, reject other sessions and stop working after logout or expiry',async()=>{
 const sender=new MemorySender();const origin='http://127.0.0.1:3200';
 const app=await buildApp({db,otpSecret:secret,otpSender:sender,origin,secureCookies:false});
 try {
  async function signIn(target:string) {
   const requested=await app.inject({method:'POST',url:'/api/store/v1/auth/otp/request',headers:{origin},payload:{channel:'email',destination:target}});
   assert.equal(requested.statusCode,200);
   const verified=await app.inject({method:'POST',url:'/api/store/v1/auth/otp/verify',headers:{origin},payload:{challengeId:requested.json().challengeId,code:sender.messages.at(-1)!.code}});
   assert.equal(verified.statusCode,200);
   return {cookie:String(verified.headers['set-cookie']).split(';')[0]!,csrf:verified.json().csrfToken};
  }
  const first=await signIn('first@example.test');const second=await signIn('second@example.test');
  const me=await app.inject({url:'/api/store/v1/auth/me',headers:{cookie:first.cookie}});
  assert.equal(me.statusCode,200);assert.equal(me.json().csrfToken,first.csrf);
  assert.equal(me.headers['cache-control'],'no-store');assert.ok(!('token' in me.json()));
  assert.equal((await app.inject({url:'/api/store/v1/auth/me',headers:{cookie:first.cookie}})).json().csrfToken,first.csrf);
  assert.notEqual(first.csrf,second.csrf);
  assert.equal((await app.inject({method:'POST',url:'/api/store/v1/auth/logout',headers:{origin,cookie:first.cookie,'x-csrf-token':second.csrf}})).statusCode,403);
  const loggedOut=await app.inject({method:'POST',url:'/api/store/v1/auth/logout',headers:{origin,cookie:first.cookie,'x-csrf-token':me.json().csrfToken}});
  assert.equal(loggedOut.statusCode,200);assert.match(String(loggedOut.headers['set-cookie']),/Max-Age=0/);
  assert.equal((await app.inject({url:'/api/store/v1/auth/me',headers:{cookie:first.cookie}})).statusCode,401);
  assert.equal((await app.inject({url:'/api/store/v1/auth/me',headers:{cookie:second.cookie}})).statusCode,200);
  await db.pool.query("UPDATE auth_sessions SET expires_at=now()-interval '1 second' WHERE revoked_at IS NULL");
  assert.equal((await app.inject({url:'/api/store/v1/auth/me',headers:{cookie:second.cookie}})).statusCode,401);
 } finally {await app.close();}
});

test('outbox failures preserve orders and retries carry a stable idempotency key',async()=>{
 const f=await seed();const o=await f.service.createCheckout(f.userId,newKey(),f.input);
 // Outbox uses database time; align the worker clock to that timestamp.
 const at=new Date(new Date((await db.pool.query('SELECT available_at FROM integration_outbox')).rows[0].available_at).getTime()+1000);
 await processOne(db,{'checkout.created':async()=>{throw new Error('secret customer payload');}},at);
 assert.equal(await count('orders'),1);
 const row=(await db.pool.query('SELECT * FROM integration_outbox')).rows[0];
 assert.equal(row.status,'pending');assert.equal(row.last_error,'HANDLER_FAILED');
 const keys:string[]=[];
 await processOne(db,{'checkout.created':async(_p,c)=>{keys.push(c.idempotencyKey);}},new Date(at.getTime()+10_000));
 assert.deepEqual(keys,[`${o.orderId}:checkout.created`]);
 assert.equal((await db.pool.query('SELECT status FROM integration_outbox')).rows[0].status,'done');
});
test('competing workers claim an event once',async()=>{
 const f=await seed();await f.service.createCheckout(f.userId,newKey(),f.input);
 const at=new Date(Date.now()+1000);let calls=0;
 const handlers={'checkout.created':async()=>{calls++;await new Promise(r=>setTimeout(r,20));}};
 await Promise.all([processOne(db,handlers,at),processOne(db,handlers,at)]);assert.equal(calls,1);
});
test('import separates references, preserves leading zeros and never enables sales',async()=>{
 const data={sourceName:'test.xlsx',sourceSha256:hash('source-1'),rows:[
  {rowNumber:2,group:'Продукция/Волосы',sourceUuid:randomUUID(),sourceCode:'00001',name:'Product',externalCode:'one',sku:'SKU-1',barcodesRaw:'4673743116022 4644591877311'},
  {rowNumber:3,group:'Комплектующие',sourceUuid:randomUUID(),sourceCode:'00002',name:'Box',externalCode:'two',sku:'BOX',barcodesRaw:null}
 ]};
 const mapping=[{slug:'test',candidateSku:'SKU-1',confidence:'medium',reason:'Confirm'}];
 assert.equal(inspectImport(data,mapping).report.excluded,1);
 assert.equal((await importCatalog(db,data,mapping)).replayed,false);
 assert.equal((await importCatalog(db,data,mapping)).replayed,true);
 assert.equal(await count('products'),1);assert.equal(await count('product_barcodes'),2);
 const product=(await db.pool.query('SELECT * FROM products')).rows[0];assert.equal(product.source_code,'00001');assert.equal(product.active,false);
 assert.deepEqual(await new CommerceService(db).catalog(),[]);assert.equal(await count('product_prices'),0);
 const changed=structuredClone(data);changed.sourceSha256=hash('source-2');changed.rows[0]!.sku='OTHER';
 await assert.rejects(importCatalog(db,changed,mapping));assert.equal(await count('import_runs'),1);
 const bad=structuredClone(data);bad.rows[0]!.barcodesRaw='4673743116023';
 assert.throws(()=>inspectImport(bad,mapping),/INVALID_OR_DUPLICATE_EAN/);
});
test('actual ASAYA source import reconciles 115 rows, 25 drafts and 17 mappings',async t=>{
 let source:string;
 try {source=await readFile('data/source-catalog.json','utf8');}catch{t.skip('Run extract-catalog.py with the provided XLSX to include this source-specific check');return;}
 const mapping=JSON.parse(await readFile('data/storefront-mapping.json','utf8'));
 const report=await importCatalog(db,JSON.parse(source),mapping);
 assert.equal(report.rows,115);assert.equal(report.products,25);assert.equal(report.excluded,90);
 assert.equal(report.barcodes,49);assert.equal(report.storefrontMappings,17);assert.equal(report.unresolved.length,6);
 assert.equal(await count('products'),25);assert.equal(await count('import_rows'),115);assert.equal(await count('storefront_mappings'),17);
 assert.equal(Number((await db.pool.query('SELECT count(*) n FROM products WHERE active OR sale_approved')).rows[0].n),0);
 assert.equal((await importCatalog(db,JSON.parse(source),mapping)).replayed,true);
 const approvals=JSON.parse((await readFile('data/mapping-approvals.json','utf8')).replace(/^\uFEFF/,''));
 assert.deepEqual(await applyMappingApprovals(db,approvals),{applied:11,alreadyApproved:0,pending:6,salesActivated:0});
 assert.deepEqual(await applyMappingApprovals(db,approvals),{applied:0,alreadyApproved:11,pending:6,salesActivated:0});
 assert.equal(Number((await db.pool.query('SELECT count(*) n FROM storefront_mappings WHERE approved')).rows[0].n),11);
 assert.equal(Number((await db.pool.query('SELECT count(*) n FROM products WHERE active OR sale_approved')).rows[0].n),0);
 assert.equal(await count('product_prices'),0);
});

test('mapping approvals roll back as a batch on changed targets and reject an unimported source',async()=>{
 const sourceSha256=hash('approval-fixture');
 const source={sourceName:'fixture.xlsx',sourceSha256,rows:['A','B'].map((sku,i)=>({
  rowNumber:i+2,group:'Продукция/Test',sourceUuid:randomUUID(),sourceCode:String(i),name:sku,externalCode:sku,sku,barcodesRaw:null
 }))};
 const mappings=['A','B'].map(sku=>({slug:sku.toLowerCase(),candidateSku:sku,confidence:'high',reason:'fixture'}));
 await importCatalog(db,source,mappings);
 const approvals={schemaVersion:1,scope:'storefront_to_catalog_mapping_only',approvedOn:'2026-09-06',evidence:'test fixture',sourceSha256,
  databaseApplied:false,saleActivationApproved:false,pricesApproved:false,inventoryApproved:false,pendingSlugs:[],
  mappings:[{slug:'a',sku:'A',status:'approved'},{slug:'b',sku:'WRONG',status:'approved'}]};
 await assert.rejects(applyMappingApprovals(db,approvals),/APPROVAL_MAPPING_CHANGED/);
 assert.equal(Number((await db.pool.query('SELECT count(*) n FROM storefront_mappings WHERE approved')).rows[0].n),0);
 approvals.mappings[1]!.sku='B';
 await assert.rejects(applyMappingApprovals(db,{...approvals,sourceSha256:hash('not imported')}),/APPROVAL_SOURCE_NOT_IMPORTED/);
 assert.deepEqual(await applyMappingApprovals(db,approvals),{applied:2,alreadyApproved:0,pending:0,salesActivated:0});
 assert.deepEqual(await applyMappingApprovals(db,approvals),{applied:0,alreadyApproved:2,pending:0,salesActivated:0});
 assert.equal(Number((await db.pool.query("SELECT count(*) n FROM audit_log WHERE entity_id IN ('a','b') AND action='catalog.mapping_approved'")).rows[0].n),2);
 assert.deepEqual(await new CommerceService(db).catalog(),[]);
});
