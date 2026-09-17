import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseOrderDetail,parseOrderSummary} from '../src/lib/auth-client.ts';
const order={id:'20000000-0000-4000-8000-000000000001',public_number:'ASAYA-10001',status:'processing',payment_status:'paid',delivery_status:'arrived_to_pickup_point',currency:'RUB',total_minor:50100,subtotal_minor:50000,delivery_minor:100,created_at:'2026-09-15T10:00:00Z',canCancel:false,shipment:null,items:[{sku:'SKU',name_snapshot:'Product',quantity:1,unit_minor:50000,line_minor:50000}]};
test('customer tracking accepts only known statuses and numeric shipment numbers, never trusts external labels',()=>{
 const tracking={status:'ready_for_pickup',label:'untrusted provider text',trackingNumber:'1234567890',updatedAt:'2026-09-15T12:00:00Z',history:[{status:'in_transit',label:'raw provider code',occurredAt:'2026-09-15T11:00:00Z'}],secret:'not allowed'};
 const parsed=parseOrderDetail({...order,tracking});assert.equal(parsed.tracking.label,'Готов к выдаче');assert.equal(parsed.tracking.history[0].label,'В пути');assert.equal(parsed.tracking.secret,undefined);
 for(const change of [{status:'unknown'},{trackingNumber:'javascript:bad'},{updatedAt:'yesterday'},{history:[{status:'delivered',occurredAt:'wrong'}]}])assert.throws(()=>parseOrderDetail({...order,tracking:{...tracking,...change}}));
 assert.equal(parseOrderSummary({...order,customer_status:'ready_for_pickup'}).customer_status,'ready_for_pickup');assert.throws(()=>parseOrderSummary({...order,customer_status:'untrusted'}));
});

test('v10.1 statuses and optional delivery details survive parsing without leaking provider data',()=>{
 for(const status of ['paid','processing','handed_to_delivery','in_transit','ready_for_pickup','delivered','delivery_problem','returning','returned','cancelled']){
  const tracking={status,label:'PRIVATE',trackingNumber:'1234567890',updatedAt:'2026-09-17T12:00:00Z',lastStatusAt:'2026-09-17T11:00:00Z',pickupPoint:'MSK123',plannedDeliveryDate:'2026-10-01',history:[{status,occurredAt:'2026-09-17T11:00:00Z'}],recipient:{phone:'PRIVATE'}};
  const parsed=parseOrderDetail({...order,customer_status:status,tracking});
  assert.equal(parsed.tracking.plannedDeliveryDate,'2026-10-01');assert.equal(parsed.tracking.pickupPoint,'MSK123');assert.ok(!JSON.stringify(parsed).includes('PRIVATE'));
  for(const change of [{plannedDeliveryDate:'2026-02-30'},{plannedDeliveryDate:'yesterday'},{pickupPoint:12},{lastStatusAt:'bad'}])assert.throws(()=>parseOrderDetail({...order,tracking:{...tracking,...change}}));
 }
});
