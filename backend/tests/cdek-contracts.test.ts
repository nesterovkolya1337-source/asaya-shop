import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CdekFulfillmentClient,fulfillmentPayload,type FulfillmentSnapshot} from '../src/cdek-fulfillment.js';
import {CdekDeliveryClient,parseCdekOrder} from '../src/cdek-delivery.js';
import {deliveryStatus,fulfillmentStatus,customerOrderStatus} from '../src/cdek-status.js';
import {authorizeCdekWebhook} from '../src/order-tracking.js';
const settings={login:'test@example.test',password:'test-fixture-only',shopId:217484,warehouseId:7460,senderId:9704,environment:'test' as const};
const snapshot:FulfillmentSnapshot={externalId:'TEST-ASAYA-10001',environment:'test',payment:'paid',customer:{name:'Тест',phone:'+79990000000'},delivery:{method:'pickup_point',rateId:49,servicePointId:1234},items:[{offerId:54321,quantity:2,unitMinor:267844}]};
const ffOrder={id:765,extId:snapshot.externalId,state:'assembling',paymentState:'paid',eav:{'order-reserve-warehouse':7460},_embedded:{shop:{id:217484},deliveryRequest:{trackingNumber:'1234567890'}},profile:{secret:'never returned'}};
const uuid='c0137489-783c-4279-a9a9-6bf221c9a1a4';
const entity={uuid,cdek_number:'1234567890',is_return:false,is_reverse:false,is_client_return:false,statuses:[{code:'CREATED',date_time:'2026-09-14T12:00:00+0300'},{code:'ACCEPTED_AT_PICK_UP_POINT',date_time:'2026-09-15T12:00:00+0300'}],recipient:{phone:'private'}};
test('FF payload uses verified offer/rate/PVZ identifiers, rubles and prepaid zero COD',()=>{
 const payload=fulfillmentPayload(settings,snapshot);
 assert.equal(payload.orderProducts[0]!.price,2678.44);assert.equal(payload.deliveryRequest.retailPrice,0);assert.equal(payload.deliveryRequest.servicePoint,1234);assert.equal(payload.paymentState,'paid');
 assert.throws(()=>fulfillmentPayload(settings,{...snapshot,payment:'pending'}));
 assert.throws(()=>fulfillmentPayload(settings,{...snapshot,delivery:{...snapshot.delivery,servicePointId:'MSK2290'}}));
 assert.throws(()=>fulfillmentPayload(settings,{...snapshot,environment:'production'}));
 assert.throws(()=>fulfillmentPayload({...settings,environment:'production'},{...snapshot,environment:'production'}),/FULFILLMENT_TEST_ACCOUNT/);
 assert.throws(()=>fulfillmentPayload(settings,{...snapshot,items:[snapshot.items[0],snapshot.items[0]]}));
});
test('FF searches exact extId, rejects ambiguity/cross-account matches and strips personal data',async()=>{
 let calls=0;
 const client=new CdekFulfillmentClient(settings,async(url,init)=>{calls++;const u=new URL(String(url));assert.equal(u.origin,'https://cdek.orderadmin.ru');assert.equal(u.pathname,'/api/products/order');assert.equal(u.searchParams.get('filter[0][field]'),'extId');assert.equal(u.searchParams.get('filter[0][value]'),snapshot.externalId);assert.equal(init?.method,'GET');assert.equal(init?.redirect,'error');return Response.json({total_items:1,_embedded:{order:[ffOrder]}});});
 assert.deepEqual(await client.find(snapshot.externalId),{id:765,externalId:snapshot.externalId,rawStatus:'assembling',status:'assembling',trackingNumber:'1234567890'});assert.equal(calls,1);
 for(const result of [{total_items:2,_embedded:{order:[ffOrder]}},{total_items:1,_embedded:{order:[{...ffOrder,_embedded:{shop:{id:2}}}]}},{total_items:1,_embedded:{order:[{...ffOrder,extId:'different'}]}}])await assert.rejects(new CdekFulfillmentClient(settings,async()=>Response.json(result)).find(snapshot.externalId));
 let posts=0;const failing=new CdekFulfillmentClient(settings,async()=>{posts++;throw new Error('private credential');});
 await assert.rejects(failing.create(snapshot),e=>e instanceof Error&&e.message==='FULFILLMENT_UNAVAILABLE');assert.equal(posts,1);
});
test('warehouse and delivery status domains remain separate; transit returns do not imply refund',()=>{
 assert.equal(fulfillmentStatus('complete'),'handed_to_delivery');
 assert.equal(deliveryStatus('RETURNED_TO_SENDER_CITY_WAREHOUSE'),'in_transit');
 assert.equal(deliveryStatus('ENTERED_TO_PICK_UP_POINT'),'in_transit');
 assert.equal(deliveryStatus('ACCEPTED_AT_PICK_UP_POINT'),'ready_for_pickup');
 assert.equal(deliveryStatus('NOT_DELIVERED'),'returning');assert.equal(deliveryStatus('new-code'),'review');
 assert.equal(customerOrderStatus({payment:'paid',order:'placed',fulfillment:'assembled'}),'processing');
 assert.equal(customerOrderStatus({payment:'paid',order:'placed',fulfillment:'handed_to_delivery',delivery:'delivered'}),'delivered');
 assert.equal(customerOrderStatus({payment:'paid',order:'placed',delivery:'returning'}),'returning');
 assert.equal(customerOrderStatus({payment:'paid',order:'placed',delivery:'handed_to_cdek'}),'handed_to_delivery');
 assert.equal(customerOrderStatus({payment:'paid',order:'placed',delivery:'out_for_delivery'}),'in_transit');
 assert.equal(customerOrderStatus({payment:'paid',order:'placed',delivery:'review'}),'delivery_problem');
 assert.equal(customerOrderStatus({payment:'paid',order:'placed',delivery:'returned'}),'returned');
});
test('CDEK order parser verifies shipment identity and keeps deleted/corrected status history without recipient data',()=>{
 const result=parseCdekOrder({entity:{...entity,statuses:[...entity.statuses,{code:'DELIVERED',date_time:'2026-09-15T13:00:00+0300',deleted:true}]}},{trackingNumber:entity.cdek_number,uuid});
 assert.equal(result.events[0]!.occurredAt,'2026-09-14T09:00:00.000Z');assert.equal(result.events.at(-1)!.deleted,true);assert.ok(!JSON.stringify(result).includes('private'));
 assert.throws(()=>parseCdekOrder({entity},{trackingNumber:'999999'}));
 assert.throws(()=>parseCdekOrder({entity:{...entity,is_return:true}},{trackingNumber:entity.cdek_number}));
 assert.throws(()=>parseCdekOrder({entity:{...entity,statuses:[{code:'DELIVERED',date_time:'2026-09-15 12:00:00'}]}},{trackingNumber:entity.cdek_number}));
});
test('CDEK transport caches concurrent authorization and uses read-only order API, never creates waybills',async()=>{
 let auth=0,reads=0;
 const client=new CdekDeliveryClient({account:'cdek-test',clientId:'test-client',clientSecret:'test-secret',environment:'test'},async(url,init)=>{
  const u=new URL(String(url));assert.equal(u.origin,'https://api.edu.cdek.ru');assert.equal(init?.redirect,'error');
  if(u.pathname==='/v2/oauth/token'){auth++;assert.equal(init?.method,'POST');return Response.json({access_token:'private-token',expires_in:3600,token_type:'bearer'});}
  assert.equal(u.pathname,'/v2/orders');assert.equal(u.searchParams.get('cdek_number'),entity.cdek_number);assert.equal((init?.headers as Record<string,string>).authorization,'Bearer private-token');assert.notEqual(init?.method,'POST');reads++;return Response.json({entity});
 });
 await Promise.all([client.order({trackingNumber:entity.cdek_number}),client.order({trackingNumber:entity.cdek_number})]);assert.equal(auth,1);assert.equal(reads,2);
 const failed=new CdekDeliveryClient({account:'cdek-test',clientId:'test-client',clientSecret:'secret',environment:'test'},async()=>{throw new Error('secret URL');});
 await assert.rejects(failed.order({trackingNumber:entity.cdek_number}),e=>e instanceof Error&&e.message==='CDEK_UNAVAILABLE');
});
test('CDEK callback requires an independent unpredictable secret',()=>{
 const secret='callback-fixture-'.repeat(4);authorizeCdekWebhook(secret,secret);
 assert.throws(()=>authorizeCdekWebhook('wrong',secret),/NOT_FOUND/);assert.throws(()=>authorizeCdekWebhook('short','short'),/NOT_FOUND/);
});

test('CDEK parser retains only documented pickup code and calendar ETA, rejects invalid dates',()=>{
 const parsed=parseCdekOrder({entity:{...entity,delivery_point:'MSK123',planned_delivery_date:'2026-10-01',to_location:{address:'PRIVATE_ADDRESS'}}},{trackingNumber:entity.cdek_number});
 assert.equal(parsed.pickupPoint,'MSK123');assert.equal(parsed.plannedDeliveryDate,'2026-10-01');
 assert.ok(!JSON.stringify(parsed).includes('PRIVATE'));assert.equal('recipient' in parsed,false);
 assert.throws(()=>parseCdekOrder({entity:{...entity,planned_delivery_date:'2026-02-30'}},{trackingNumber:entity.cdek_number}),/CDEK_INVALID_RESPONSE/);
});

test('CDEK GET failures expose no provider body and make only one request per scheduled attempt',async()=>{
 for(const status of [429,500,503,'timeout'] as const){
  let calls=0;
  const client=new CdekDeliveryClient({account:'fixture',clientId:'client',clientSecret:'SECRET',environment:'test'},async(url)=>{
   if(String(url).includes('/oauth/token'))return Response.json({access_token:'SECRET_TOKEN',expires_in:3600,token_type:'bearer'});
   calls++;if(status==='timeout')throw new DOMException('PRIVATE_URL','TimeoutError');
   return new Response('PRIVATE_PROVIDER_BODY',{status});
  });
  await assert.rejects(client.order({trackingNumber:entity.cdek_number,uuid}),e=>e instanceof Error&&e.message==='CDEK_UNAVAILABLE');
  assert.equal(calls,1);
 }
});
