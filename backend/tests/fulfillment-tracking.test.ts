import {before,after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {testDatabase} from './postgres.js';
import {FulfillmentDispatch,type FulfillmentBinding,type FulfillmentGateway} from '../src/fulfillment-dispatch.js';
import {OrderTracking,trackingProjection} from '../src/order-tracking.js';
import type {FulfillmentOrder} from '../src/cdek-fulfillment.js';
import {buildApp} from '../src/app.js';
import {DisabledOtpSender} from '../src/auth.js';
import {purgeUnpaidContacts} from '../src/order-retention.js';
let ctx:Awaited<ReturnType<typeof testDatabase>>;
before(async()=>{ctx=await testDatabase();});after(async()=>{await ctx?.stop();});
beforeEach(async()=>{await ctx.db.pool.query('TRUNCATE users,products,warehouses,integration_outbox,integration_inbox CASCADE');});
async function fixture(){
 const db=ctx.db,order=randomUUID(),user=randomUUID(),product=randomUUID(),warehouse=randomUUID(),checkout=randomUUID();
 await db.pool.query('INSERT INTO users(id,disabled) VALUES($1,true)',[user]);
 await db.pool.query("INSERT INTO warehouses(id,code,name,active) VALUES($1,'FFTEST','Test',true)",[warehouse]);
 await db.pool.query("INSERT INTO products(id,sku,name) VALUES($1,'SKU','Test')",[product]);
 await db.pool.query('INSERT INTO inventory_balances(product_id,warehouse_id,on_hand,reserved) VALUES($1,$2,10,1)',[product,warehouse]);
 await db.pool.query("INSERT INTO checkout_sessions(id,user_id,status,snapshot,expires_at) VALUES($1,$2,'placed',$3,now()+interval '1 hour')",[checkout,user,JSON.stringify({customer:{phone:'+79990000000'},delivery:{address:'private'},items:[{id:'SKU'}]})]);
 await db.pool.query(`INSERT INTO orders(id,public_number,checkout_id,user_id,status,payment_status,delivery_status,currency,subtotal_minor,delivery_minor,total_minor,customer_snapshot,delivery_snapshot,consent_snapshot)
  VALUES($1,'ASAYA-'||nextval('public_order_sequence'),$2,$3,'placed','paid','not_created','RUB',50000,0,50000,$4,$5,'{}')`,[order,checkout,user,JSON.stringify({source:'ycp',name:'Тест',phone:'+79990000000'}),JSON.stringify({source:'ycp',ycp:{service_type:'cdek',delivery_method:'pickup_point',address:{pickup_point_id:'TEST-PVZ'}}})]);
 await db.pool.query("INSERT INTO order_items(order_id,product_id,sku,name_snapshot,quantity,unit_minor,line_minor) VALUES($1,$2,'SKU','Test',1,50000,50000)",[order,product]);
 await db.pool.query("INSERT INTO inventory_reservations(order_id,product_id,warehouse_id,quantity,expires_at,status) VALUES($1,$2,$3,1,now()+interval '1 hour','active')",[order,product,warehouse]);
 await db.pool.query("INSERT INTO ycp_sessions(account_id,environment,session_id,order_id,request_hash,placement_outcome,payment_method,external_order_id) VALUES('ycp-test','test',$1::text,$1::uuid,'hash','placed','online',$1::text)",[order]);
 await db.pool.query("INSERT INTO payments(id,order_id,provider,account_id,environment,external_id,status,amount_minor,currency) VALUES($1,$2::uuid,'ycp','ycp-test','test',$2::text,'paid',50000,'RUB')",[randomUUID(),order]);
 await db.pool.query("INSERT INTO product_external_ids(provider,account_id,environment,external_id,product_id) VALUES('cdek_ff','217484','test','54321',$1)",[product]);
 const binding:FulfillmentBinding={enabled:true,environment:'test',ycpAccountId:'ycp-test',deliveryAccountId:'cdek-test',warehouseId:warehouse,shopId:217484,ffWarehouseId:7460,senderId:9704,pickupRateId:49,ycpWaybillsDisabled:false,contractVerified:false};
 return {db,order,user,checkout,product,binding};
}
test('FF submits only a verified paid immutable order; duplicate and ambiguous retries cannot create a second shipment',async()=>{
 const f=await fixture();let posts=0,remote:FulfillmentOrder|null=null;
 const gateway:FulfillmentGateway={servicePoint:async code=>{assert.equal(code,'TEST-PVZ');return 1234;},find:async()=>remote,get:async()=>remote!,create:async s=>{posts++;remote={id:123,externalId:s.externalId,rawStatus:'assembling',status:'assembling',trackingNumber:'1234567890'};throw new Error('response lost after acceptance');}};
 const service=new FulfillmentDispatch(f.db,gateway,f.binding);
 await f.db.pool.query("UPDATE orders SET payment_status='pending' WHERE id=$1",[f.order]);
 await assert.rejects(service.submit(f.order),/PAYMENT_NOT_CONFIRMED/);assert.equal(posts,0);
 await f.db.pool.query("UPDATE orders SET payment_status='paid' WHERE id=$1",[f.order]);
 assert.deepEqual(await service.submit(f.order),{state:'review'});assert.equal(posts,1);
 assert.equal((await f.db.pool.query('SELECT state FROM fulfillment_jobs')).rows[0].state,'uncertain');
 const confirmed=remote;remote=null;assert.deepEqual(await service.submit(f.order),{state:'review'});assert.equal(posts,1);
 remote=confirmed;assert.deepEqual(await service.submit(f.order),{state:'created'});await service.submit(f.order);assert.equal(posts,1);
 assert.equal((await f.db.pool.query('SELECT external_id FROM fulfillment_jobs')).rows[0].external_id,'123');
 assert.equal((await f.db.pool.query('SELECT tracking_number FROM order_logistics')).rows[0].tracking_number,'1234567890');
 assert.equal((await f.db.pool.query('SELECT reserved FROM inventory_balances')).rows[0].reserved,1);
});
test('FF refuses missing product mappings and production activation with the verified test account',async()=>{
 const f=await fixture();let calls=0;
 const gateway:FulfillmentGateway={find:async()=>{calls++;return null;},create:async()=>{calls++;throw new Error();},get:async()=>{throw new Error();},servicePoint:async()=>1234};
 await f.db.pool.query('DELETE FROM product_external_ids');
 await assert.rejects(new FulfillmentDispatch(f.db,gateway,f.binding).submit(f.order),/PRODUCT_MAPPING_REQUIRED/);assert.equal(calls,0);
 assert.throws(()=>new FulfillmentDispatch(f.db,gateway,{...f.binding,environment:'production',ycpWaybillsDisabled:true,contractVerified:true}),/PRODUCTION_NOT_READY/);
});

test('FF rechecks the reserve after the remote pickup lookup and does not submit an order dispatched meanwhile',async()=>{
 const f=await fixture();let posts=0;
 const gateway:FulfillmentGateway={find:async()=>null,get:async()=>{throw new Error();},create:async()=>{posts++;throw new Error();},servicePoint:async()=>{
  await f.db.pool.query("UPDATE inventory_reservations SET status='consumed' WHERE order_id=$1",[f.order]);return 1234;
 }};
 await assert.rejects(new FulfillmentDispatch(f.db,gateway,f.binding).submit(f.order),/FULFILLMENT_RESERVATION_CHANGED/);
 assert.equal(posts,0);assert.equal((await f.db.pool.query('SELECT 1 FROM fulfillment_jobs')).rowCount,0);
});
test('CDEK webhook is authenticated before parsing, queues known shipments only, and cannot assert delivery or payment',async()=>{
 const f=await fixture(),shipment=randomUUID(),at=new Date('2026-09-15T12:00:00Z');let getCalls=0;
 await f.db.pool.query("INSERT INTO order_logistics(order_id,account_id,environment,tracking_number) VALUES($1,'cdek-test','test','1234567890')",[f.order]);
 const tracking=new OrderTracking(f.db,{order:async()=>{getCalls++;return {uuid:shipment,trackingNumber:'1234567890',events:[{rawStatus:'CREATED',status:'created',occurredAt:'2026-09-14T12:00:00Z',deleted:false},{rawStatus:'ACCEPTED_AT_PICK_UP_POINT',status:'ready_for_pickup',occurredAt:at.toISOString(),deleted:false}]};}},{accountId:'cdek-test',environment:'test'},()=>at);
 const secret='independent-callback-fixture-'.repeat(3);
 const app=await buildApp({db:f.db,otpSecret:'o'.repeat(32),otpSender:new DisabledOtpSender(),origin:'https://asaya.example.test',secureCookies:true,cdekTracking:{service:tracking,secret}});
 const body={type:'ORDER_STATUS',uuid:shipment,date_time:at.toISOString(),attributes:{cdek_number:'1234567890',code:'DELIVERED',status_date_time:at.toISOString(),is_return:false,is_reverse:false,is_client_return:false}};
 try{
  assert.equal((await app.inject({method:'POST',url:'/api/integrations/cdek/wrong',headers:{'content-type':'application/json'},payload:'{bad'})).statusCode,404);
  for(let i=0;i<2;i++)assert.equal((await app.inject({method:'POST',url:'/api/integrations/cdek/'+secret,payload:body})).statusCode,200);
  assert.equal(getCalls,0);assert.equal((await f.db.pool.query('SELECT delivery_status FROM order_logistics')).rows[0].delivery_status,null);
  assert.equal((await f.db.pool.query("SELECT 1 FROM integration_inbox WHERE provider='cdek'")).rowCount,1);
  assert.deepEqual(await tracking.due(),[f.order]);await tracking.refresh(f.order);assert.equal(getCalls,1);
  assert.equal((await trackingProjection(f.db,{id:f.order,status:'placed',payment_status:'paid'}))!.status,'ready_for_pickup');
  assert.equal((await f.db.pool.query('SELECT payment_status FROM orders')).rows[0].payment_status,'paid');
  assert.equal((await f.db.pool.query('SELECT cdek_uuid FROM order_logistics')).rows[0].cdek_uuid,shipment);
  assert.deepEqual((await f.db.pool.query('SELECT on_hand,reserved FROM inventory_balances')).rows[0],{on_hand:9,reserved:0});
  await tracking.refresh(f.order);assert.deepEqual((await f.db.pool.query('SELECT on_hand,reserved FROM inventory_balances')).rows[0],{on_hand:9,reserved:0});
  assert.deepEqual(await tracking.due(),[]);
  await tracking.failed(f.order);assert.ok((await f.db.pool.query('SELECT delivery_next_attempt_at FROM order_logistics')).rows[0].delivery_next_attempt_at>at);
 }finally{await app.close();}
});
test('unpaid retention honors definitive provider cancellation, 30 days and legal hold while retaining order lines',async()=>{
 const f=await fixture();await f.db.pool.query('DELETE FROM payments');
 await f.db.pool.query("UPDATE orders SET status='cancelled',payment_status='cancelled',updated_at=now()-interval '31 days' WHERE id=$1",[f.order]);
 const scope={accountId:'ycp-test',environment:'test' as const};
 assert.equal(await purgeUnpaidContacts(f.db,scope),0);
 await f.db.pool.query("INSERT INTO order_status_history(id,order_id,kind,status,source) VALUES($1,$2,'order','cancelled','ycp')",[randomUUID(),f.order]);
 await f.db.pool.query('UPDATE orders SET legal_hold=true WHERE id=$1',[f.order]);assert.equal(await purgeUnpaidContacts(f.db,scope),0);
 await f.db.pool.query('UPDATE orders SET legal_hold=false WHERE id=$1',[f.order]);assert.equal(await purgeUnpaidContacts(f.db,scope),1);
 assert.equal(await purgeUnpaidContacts(f.db,scope),0);
 const order=(await f.db.pool.query('SELECT customer_snapshot,delivery_snapshot,total_minor FROM orders')).rows[0];
 assert.equal(order.customer_snapshot.redacted,true);assert.equal(order.delivery_snapshot.redacted,true);assert.equal(order.total_minor,'50000');
 const draft=(await f.db.pool.query('SELECT snapshot FROM checkout_sessions')).rows[0].snapshot;assert.equal(draft.customer,undefined);assert.equal(draft.delivery,undefined);assert.ok(draft.items);
 assert.equal((await f.db.pool.query('SELECT 1 FROM order_items')).rowCount,1);
});
