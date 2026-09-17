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
import {parseCdekOrder} from '../src/cdek-delivery.js';
import {CdekCorrelation} from '../src/cdek-correlation.js';
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
test('confirmed CDEK client number binds scoped YCP order once and existing status pipeline consumes that binding',async()=>{
 const f=await fixture(),uuid=randomUUID(),number=(await f.db.pool.query('SELECT public_number FROM orders WHERE id=$1',[f.order])).rows[0].public_number;
 let calls=0;const api={order:async()=>{calls++;return {uuid,trackingNumber:'1234567890',clientOrderNumber:number,events:[{rawStatus:'CREATED',status:'created' as const,occurredAt:new Date().toISOString(),deleted:false}]};}};
 const scope={ycpAccountId:'ycp-test',deliveryAccountId:'cdek-test',environment:'test' as const},correlation=new CdekCorrelation(f.db,api,scope);
 const proof=await correlation.verify(f.order,'1234567890');assert.equal(proof.internalNumber,number);assert.equal((await f.db.pool.query('SELECT 1 FROM order_logistics')).rowCount,0);
 await assert.rejects(correlation.bind(f.order,'1234567890','different'),/CONFIRMATION_REQUIRED/);
 const results=await Promise.all([correlation.bind(f.order,'1234567890',number),correlation.bind(f.order,'1234567890',number)]);
 assert.equal(results.filter(r=>!r.alreadyBound).length,1);assert.equal((await f.db.pool.query("SELECT 1 FROM audit_log WHERE action='cdek.correlation_verified'")).rowCount,1);
 const tracking=new OrderTracking(f.db,api,{accountId:'cdek-test',environment:'test'});await tracking.refresh(f.order);
 assert.equal((await f.db.pool.query('SELECT delivery_status FROM order_logistics WHERE order_id=$1',[f.order])).rows[0].delivery_status,'created');
 assert.equal((await f.db.pool.query('SELECT payment_status FROM orders WHERE id=$1',[f.order])).rows[0].payment_status,'paid');assert.ok(calls>=4);
 assert.equal((await f.db.pool.query('SELECT 1 FROM fulfillment_jobs')).rowCount,0);
});

test('CDEK correlation rejects missing/different client number, foreign scope and reused immutable binding',async()=>{
 const f=await fixture(),uuid=randomUUID(),number=(await f.db.pool.query('SELECT public_number FROM orders WHERE id=$1',[f.order])).rows[0].public_number;
 let clientOrderNumber:string|undefined='not-the-order';const api={order:async()=>({uuid,trackingNumber:'1234567890',clientOrderNumber,events:[]})};
 const scope={ycpAccountId:'ycp-test',deliveryAccountId:'cdek-test',environment:'test' as const},correlation=new CdekCorrelation(f.db,api,scope);
 await assert.rejects(correlation.verify(f.order,'1234567890'),/CLIENT_NUMBER_MISMATCH/);clientOrderNumber=undefined;await assert.rejects(correlation.verify(f.order,'1234567890'),/CLIENT_NUMBER_MISMATCH/);
 clientOrderNumber=number;await assert.rejects(new CdekCorrelation(f.db,api,{...scope,ycpAccountId:'other'}).verify(f.order,'1234567890'),/ORDER_NOT_READY/);
 await assert.rejects(new CdekCorrelation(f.db,api,{...scope,environment:'production'}).verify(f.order,'1234567890'),/ORDER_NOT_READY/);
 await f.db.pool.query("INSERT INTO order_logistics(order_id,account_id,environment,cdek_uuid,tracking_number) VALUES($1,'cdek-test','test',$2,'9876543210')",[f.order,randomUUID()]);
 await assert.rejects(correlation.bind(f.order,'1234567890',number),/BINDING_CONFLICT/);
});

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
test('obsolete automatic contact retention is disabled even for cancelled old orders',async()=>{
 const f=await fixture();const before=(await f.db.pool.query('SELECT customer_snapshot,delivery_snapshot FROM orders')).rows;
 await assert.rejects(purgeUnpaidContacts(f.db,{accountId:'ycp-test',environment:'test'}),/AUTOMATIC_RETENTION_DISABLED/);
 assert.deepEqual((await f.db.pool.query('SELECT customer_snapshot,delivery_snapshot FROM orders')).rows,before);
});

async function trackingFixture(){
 const f=await fixture(),uuid=randomUUID();let now=new Date('2026-09-17T12:00:00Z');
 await f.db.pool.query("INSERT INTO order_logistics(order_id,account_id,environment,tracking_number) VALUES($1,'cdek-test','test','1234567890')",[f.order]);
 let statuses=[{code:'ACCEPTED_AT_PICK_UP_POINT',date_time:'2026-09-17T11:00:00Z',deleted:false}];
 let error=false;
 const api={order:async()=>{if(error)throw new Error('provider offline');return parseCdekOrder({entity:{uuid,cdek_number:'1234567890',is_return:false,is_reverse:false,is_client_return:false,delivery_point:'MSK123',planned_delivery_date:'2026-09-19',statuses,recipient:{phone:'PRIVATE'}}},{trackingNumber:'1234567890'});}};
 const scope={accountId:'cdek-test',environment:'test' as const};
 const service=new OrderTracking(f.db,api,scope,()=>now);
 const body=(deleted=false)=>({type:'ORDER_STATUS',uuid,date_time:now.toISOString(),attributes:{cdek_number:'1234567890',code:'DELIVERED',status_date_time:'2026-09-17T11:30:00Z',deleted,is_return:false,is_reverse:false,is_client_return:false}});
 return {...f,uuid,api,scope,service,body,advance:(ms:number)=>{now=new Date(+now+ms);},setStatuses:(value:typeof statuses)=>{statuses=value;},setError:()=>{error=true;}};
}

test('CDEK status correction is durably queued once, reconciles deleted history and keeps calendar ETA private',async()=>{
 const f=await trackingFixture();
 const arrived={code:'ACCEPTED_AT_PICK_UP_POINT',date_time:'2026-09-17T11:00:00Z',deleted:false};
 const delivered={code:'DELIVERED',date_time:'2026-09-17T11:30:00Z',deleted:false};
 f.setStatuses([arrived,delivered]);await f.service.webhook(f.body());await f.service.refresh(f.order);
 f.advance(1000);f.setStatuses([arrived,{...delivered,deleted:true}]);
 await f.service.webhook(f.body(true));await f.service.webhook(f.body(true));
 assert.equal((await f.db.pool.query("SELECT 1 FROM integration_inbox WHERE provider='cdek'")).rowCount,2);
 assert.deepEqual(await f.service.due(),[f.order]);await f.service.refresh(f.order);
 const projection=(await trackingProjection(f.db,{id:f.order,status:'processing',payment_status:'paid'}))!;
 assert.equal(projection.status,'ready_for_pickup');assert.equal(projection.plannedDeliveryDate,'2026-09-19');assert.equal(projection.pickupPoint,'MSK123');
 assert.ok(projection.history.every(e=>e.status!=='delivered'));assert.ok(!JSON.stringify(projection).includes('PRIVATE'));
 assert.equal((await f.db.pool.query("SELECT deleted FROM order_logistics_events WHERE raw_status='DELIVERED'")).rows[0].deleted,true);
 assert.equal((await f.db.pool.query('SELECT payment_status FROM orders')).rows[0].payment_status,'paid');
 assert.deepEqual((await f.db.pool.query('SELECT on_hand,reserved FROM inventory_balances')).rows[0],{on_hand:9,reserved:0});
});

test('CDEK daily/stale fallback respects ownership, final states and eight-attempt backoff without erasing status',async()=>{
 const f=await trackingFixture();await f.service.refresh(f.order);assert.deepEqual(await f.service.due(),[]);
 f.advance(61*60000);await f.service.requestStale(f.order,randomUUID());assert.deepEqual(await f.service.due(),[]);
 await f.service.requestStale(f.order,f.user);assert.deepEqual(await f.service.due(),[f.order]);
 f.setError();await assert.rejects(f.service.refresh(f.order));await f.service.failed(f.order);assert.deepEqual(await f.service.due(),[]);
 for(let i=1;i<8;i++)await f.service.failed(f.order);
 const row=(await f.db.pool.query('SELECT delivery_attempts,delivery_next_attempt_at,delivery_status FROM order_logistics')).rows[0];
 assert.equal(row.delivery_attempts,8);assert.equal(row.delivery_status,'ready_for_pickup');
 f.advance(23*3600000);assert.deepEqual(await f.service.due(),[]);f.advance(3600000);assert.deepEqual(await f.service.due(),[f.order]);
 await f.db.pool.query("UPDATE order_logistics SET delivery_requested_at=NULL,delivery_next_attempt_at=NULL,delivery_status='delivered'");
 f.advance(25*3600000);await f.service.requestStale(f.order,f.user);assert.deepEqual(await f.service.due(),[]);
 await f.db.pool.query("UPDATE order_logistics SET delivery_status='in_transit'");assert.deepEqual(await f.service.due(),[f.order]);
});

test('unknown, cross-account and mismatched-UUID CDEK hints cannot bind or queue an order',async()=>{
 const f=await trackingFixture();
 await f.service.webhook({...f.body(),attributes:{...f.body().attributes,cdek_number:'999999'}});
 await new OrderTracking(f.db,f.api,{...f.scope,accountId:'another'}).webhook(f.body());
 await f.db.pool.query('UPDATE order_logistics SET cdek_uuid=$1',[randomUUID()]);await f.service.webhook(f.body());
 assert.equal((await f.db.pool.query("SELECT 1 FROM integration_inbox WHERE provider='cdek'")).rowCount,0);
 assert.equal((await f.db.pool.query('SELECT delivery_requested_at FROM order_logistics')).rows[0].delivery_requested_at,null);
});

test('a CDEK binding moved during GET cannot commit a response into another account',async()=>{
 const f=await trackingFixture();
 const service=new OrderTracking(f.db,{order:async()=>{const response=await f.api.order();await f.db.pool.query("UPDATE order_logistics SET account_id='another'");return response;}},f.scope);
 await assert.rejects(service.refresh(f.order),/CDEK_ORDER_MISMATCH/);
 assert.equal((await f.db.pool.query('SELECT 1 FROM order_logistics_events')).rowCount,0);
});

test('return started never marks a completed return, credits inventory or refunds payment',async()=>{
 const f=await trackingFixture();await f.service.refresh(f.order);
 f.setStatuses([{code:'NOT_DELIVERED',date_time:'2026-09-17T13:00:00Z',deleted:false}]);f.advance(3600000);await f.service.refresh(f.order);
 assert.equal((await trackingProjection(f.db,{id:f.order,status:'processing',payment_status:'paid'}))!.status,'returning');
 assert.equal((await f.db.pool.query('SELECT delivery_status FROM orders')).rows[0].delivery_status,'arrived_to_pickup_point');
 assert.deepEqual((await f.db.pool.query('SELECT on_hand,reserved FROM inventory_balances')).rows[0],{on_hand:9,reserved:0});
 assert.equal((await f.db.pool.query('SELECT 1 FROM refunds')).rowCount,0);
});
