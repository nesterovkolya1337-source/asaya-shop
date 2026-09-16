import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createOrdersClient,parseOrderDetail} from '../src/lib/auth-client.ts';

const id='00000000-0000-4000-8000-000000000001';
const summary={id,public_number:'ASAYA-10001',status:'draft',payment_status:'pending',delivery_status:'not_created',currency:'RUB',total_minor:60000,created_at:'2026-09-06T10:00:00.000Z'};
const detail={...summary,shipment:null,subtotal_minor:50000,delivery_minor:10000,canCancel:true,items:[{sku:'TEST',name_snapshot:'Test saved name',quantity:2,unit_minor:25000,line_minor:50000}]};
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status});

test('shipment details are validated and arbitrary staff fields are discarded',()=>{
 const shipment={carrier:'Test carrier',trackingNumber:'TRACK-123'};
 assert.deepEqual(parseOrderDetail({...detail,shipment:{...shipment,dispatchedBy:id,secret:'private'},completion:{reason:'private'}}).shipment,shipment);
 assert.equal(parseOrderDetail(detail).shipment,null);
 for(const invalid of [undefined,{},[],{...shipment,carrier:''},{...shipment,trackingNumber:123},{...shipment,trackingNumber:'x'.repeat(101)}])assert.throws(()=>parseOrderDetail({...detail,shipment:invalid}));
 assert.ok(!('completion' in parseOrderDetail({...detail,shipment,completion:{reason:'private'}})));
});
test('history carries session cookies, follows cursors and uses saved detail totals',async()=>{
 const calls=[];
 const api=createOrdersClient('/base/api/store/v1',async(url,options)=>{
  calls.push({url,options});
  return reply(url.endsWith(`/${id}`)?detail:{items:[summary],nextCursor:null});
 });
 assert.equal((await api.list()).items[0].id,id);
 assert.equal((await api.detail(id)).items[0].name_snapshot,'Test saved name');
 await api.list(id);
 assert.equal(calls[2].url,`/base/api/store/v1/orders?cursor=${id}`);
 assert.ok(calls.every(call=>call.options.credentials==='same-origin'&&call.options.cache==='no-store'));
});

test('invalid totals, line arithmetic, statuses and cancellation flags are rejected',()=>{
 for(const bad of [{...detail,total_minor:1},{...detail,canCancel:'false'},{...detail,canCancel:true,payment_status:'paid'},{...detail,status:'invented'},
  {...detail,items:[{...detail.items[0],quantity:3}]},{...detail,items:[]}]) assert.throws(()=>parseOrderDetail(bad));
 assert.equal(parseOrderDetail(detail).total_minor,60000);
 // YCP can disable customer cancellation even for a pending draft.
 assert.equal(parseOrderDetail({...detail,canCancel:false}).canCancel,false);
});

test('cancel sends CSRF, reports server rejection and does not claim success for malformed responses',async()=>{
 const api=createOrdersClient('/api',async(url,options)=>{
  assert.equal(url,`/api/orders/${id}/cancel`);assert.equal(options.method,'POST');
  assert.equal(options.headers['X-CSRF-Token'],'test-csrf');return reply({error:'CANCELLATION_REQUIRES_REVIEW'},409);
 });
 await assert.rejects(api.cancel(id,'test-csrf'),error=>error.code==='CANCELLATION_REQUIRES_REVIEW');
 const malformed=createOrdersClient('/api',async()=>reply({}));
 await assert.rejects(malformed.cancel(id,'test-csrf'),error=>error.code==='INVALID_RESPONSE');
 const other=createOrdersClient('/api',async()=>reply({...detail,id:'00000000-0000-4000-8000-000000000002'}));
 await assert.rejects(other.detail(id),error=>error.code==='INVALID_RESPONSE');
});
