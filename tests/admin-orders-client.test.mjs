import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAdminOrdersClient,parseAdminOrder} from '../src/lib/admin-orders-client.ts';
const id='00000000-0000-4000-8000-000000000001';
const order={id,shipment:null,completion:null,dispatch:null,packing:null,public_number:'ASAYA-10001',status:'draft',payment_status:'pending',delivery_status:'not_created',currency:'RUB',subtotal_minor:10000,delivery_minor:5000,total_minor:15000,created_at:'2026-09-06T10:00:00Z',canCancel:true,items:[{sku:'A',name_snapshot:'Old name',quantity:1,unit_minor:10000,line_minor:10000}],customer:{name:'Test',phone:'+79990000000'},delivery:{label:'Test delivery',city:'Test',address:'Test street'},history:[]};

test('delivery diagnostics validate fields and protected refresh never sends shipment creation data',async()=>{
 const diagnostics={yandexOrderId:'order',yandexOrderNumber:'123',yandexSessionId:'session',cdekUuid:id,trackingNumber:'1234567890',rawDeliveryStatus:'CREATED',lastDeliveryUpdate:null,nextDeliveryAttempt:null,deliveryUpdateFailed:false,canRefresh:true};
 assert.deepEqual(parseAdminOrder({...order,diagnostics:{...diagnostics,token:'secret'}}).diagnostics,diagnostics);
 assert.throws(()=>parseAdminOrder({...order,diagnostics:{...diagnostics,lastDeliveryUpdate:'bad'}}));
 let call;const api=createAdminOrdersClient('/api/admin/v1',async(url,options)=>{call={url,options};return new Response('{"ok":true}');});
 await api.refreshDelivery(id,'csrf');assert.equal(call.url,'/api/admin/v1/orders/'+id+'/cdek/refresh');assert.equal(call.options.headers['X-CSRF-Token'],'csrf');assert.deepEqual(JSON.parse(call.options.body),{});
});
test('admin review signals validate kinds and dates and discard private fields',()=>{
 const signal={kind:'payment.refund_review',createdAt:'2026-09-07T00:00:00Z'};
 assert.deepEqual(parseAdminOrder({...order,reviewSignals:[{...signal,payload:'secret'}]}).reviewSignals,[signal]);
 assert.deepEqual(parseAdminOrder(order).reviewSignals,[]);
 for(const reviewSignals of [{},[signal,signal],[{...signal,kind:'__proto__'}],[{...signal,createdAt:'bad'}]])assert.throws(()=>parseAdminOrder({...order,reviewSignals}));
});
test('admin list carries payment and delivery filters, cursor and literal tracking query',async()=>{
 let call;const api=createAdminOrdersClient('/api/admin/v1',async(url,options)=>{call={url,options};return new Response('{"items":[],"nextCursor":null}');});
 await api.list('TRACK_1%+','processing',id,{payment:'paid',delivery:'shipped'});
 const q=new URL(call.url,'http://localhost').searchParams;
 assert.equal(q.get('search'),'TRACK_1%+');assert.equal(q.get('status'),'processing');assert.equal(q.get('payment'),'paid');assert.equal(q.get('delivery'),'shipped');assert.equal(q.get('cursor'),id);assert.equal(call.options.credentials,'same-origin');
 await api.list();const cleared=new URL(call.url,'http://localhost').searchParams;assert.equal(cleared.get('payment'),'');assert.equal(cleared.get('delivery'),'');assert.equal(cleared.has('cursor'),false);
});
test('completion validates saved evidence and sends explicit confirmation while preserving uncertain outcomes',async()=>{
 const completion={completedBy:id,completedAt:'2026-09-06T12:00:00Z',reason:'Confirmed by buyer'};
 assert.deepEqual(parseAdminOrder({...order,completion}).completion,completion);
 for(const invalid of [undefined,{}, {...completion,completedBy:'bad'},{...completion,completedAt:'bad'},{...completion,reason:' '}])assert.throws(()=>parseAdminOrder({...order,completion:invalid}));
 let call;const api=createAdminOrdersClient('/api/admin/v1',async(url,options)=>{call={url,options};return new Response('{"ok":true}');});
 const input={reason:completion.reason,confirmed:true};await api.complete(id,input,'csrf');assert.equal(call.url,'/api/admin/v1/orders/'+id+'/complete');assert.equal(call.options.headers['X-CSRF-Token'],'csrf');assert.equal(call.options.method,'POST');assert.deepEqual(JSON.parse(call.options.body),input);
 await assert.rejects(createAdminOrdersClient('/api',async()=>new Response('{}')).complete(id,input,'csrf'),e=>e.code==='INVALID_RESPONSE');
 await assert.rejects(createAdminOrdersClient('/api',async()=>{throw new Error('offline');}).complete(id,input,'csrf'),e=>e.code==='NETWORK_ERROR');
 await assert.rejects(createAdminOrdersClient('/api',async()=>new Response('{"error":"COMPLETION_CONFLICT"}',{status:409})).complete(id,input,'csrf'),e=>e.code==='COMPLETION_CONFLICT');
});
test('dispatch validates shipment detail, sends confirmed data with CSRF and rejects uncertain results',async()=>{
 const dispatch={carrier:'Test',trackingNumber:'TRACK-1',dispatchedBy:id,dispatchedAt:'2026-09-06T11:00:00Z'};
 assert.deepEqual(parseAdminOrder({...order,dispatch}).dispatch,dispatch);
 for(const invalid of [undefined,{}, {...dispatch,carrier:''},{...dispatch,dispatchedBy:'bad'},{...dispatch,dispatchedAt:'bad'}])assert.throws(()=>parseAdminOrder({...order,dispatch:invalid}));
 let call;const api=createAdminOrdersClient('/api/admin/v1',async(url,options)=>{call={url,options};return new Response('{"ok":true}');});
 const input={carrier:'Test',trackingNumber:'TRACK-1',confirmed:true};await api.dispatch(id,input,'csrf');
 assert.equal(call.url,'/api/admin/v1/orders/'+id+'/dispatch');assert.equal(call.options.method,'POST');assert.equal(call.options.headers['X-CSRF-Token'],'csrf');assert.deepEqual(JSON.parse(call.options.body),input);
 await assert.rejects(createAdminOrdersClient('/api',async()=>new Response('{}')).dispatch(id,input,'csrf'),e=>e.code==='INVALID_RESPONSE');
 await assert.rejects(createAdminOrdersClient('/api',async()=>{throw new Error('offline');}).dispatch(id,input,'csrf'),e=>e.code==='NETWORK_ERROR');
 await assert.rejects(createAdminOrdersClient('/api',async()=>new Response('{"error":"DISPATCH_CONFLICT"}',{status:409})).dispatch(id,input,'csrf'),e=>e.code==='DISPATCH_CONFLICT');
});
test('packing validates saved confirmation and sends only checked item counts with CSRF',async()=>{
 const packing={packedBy:id,packedAt:'2026-09-06T10:15:00Z'};
 assert.deepEqual(parseAdminOrder({...order,packing}).packing,packing);
 assert.throws(()=>parseAdminOrder({...order,packing:{...packing,packedBy:'bad'}}));
 assert.throws(()=>parseAdminOrder({...order,packing:{...packing,packedAt:'invalid'}}));
 assert.throws(()=>parseAdminOrder({...order,packing:undefined}));
 let call;const api=createAdminOrdersClient('/api/admin/v1',async(url,options)=>{call={url,options};return new Response('{"ok":true}');});
 const items=[{sku:'A',quantity:1}];await api.completePacking(id,items,'csrf');
 assert.equal(call.url,'/api/admin/v1/orders/'+id+'/complete-packing');assert.equal(call.options.headers['X-CSRF-Token'],'csrf');assert.equal(call.options.credentials,'same-origin');assert.deepEqual(JSON.parse(call.options.body),{items});
 await assert.rejects(createAdminOrdersClient('/api',async()=>new Response('{}')).completePacking(id,items,'csrf'),e=>e.code==='INVALID_RESPONSE');
 await assert.rejects(createAdminOrdersClient('/api',async()=>new Response('{"error":"PACKING_ITEMS_MISMATCH"}',{status:409})).completePacking(id,items,'csrf'),e=>e.code==='PACKING_ITEMS_MISMATCH');
});
test('start processing uses a protected POST and never accepts an uncertain success',async()=>{
 let call;const api=createAdminOrdersClient('/api/admin/v1',async(url,options)=>{call={url,options};return new Response('{"ok":true}');});
 await api.startProcessing(id,'csrf');
 assert.equal(call.url,'/api/admin/v1/orders/'+id+'/start-processing');assert.equal(call.options.method,'POST');assert.equal(call.options.headers['X-CSRF-Token'],'csrf');assert.deepEqual(JSON.parse(call.options.body),{});
 await assert.rejects(createAdminOrdersClient('/api',async()=>new Response('{}')).startProcessing(id,'csrf'),e=>e.code==='INVALID_RESPONSE');
 await assert.rejects(createAdminOrdersClient('/api',async()=>{throw new Error('offline');}).startProcessing(id,'csrf'),e=>e.code==='NETWORK_ERROR');
 await assert.rejects(createAdminOrdersClient('/api',async()=>new Response('{"error":"ORDER_RESERVATION_MISSING"}',{status:409})).startProcessing(id,'csrf'),e=>e.code==='ORDER_RESERVATION_MISSING');
 assert.equal(parseAdminOrder({...order,status:'processing',payment_status:'paid',delivery_status:'preparing',canCancel:false}).status,'processing');
});
test('admin order client validates private detail and carries search, cursor, reason and CSRF',async()=>{
 assert.equal(parseAdminOrder(order).customer.name,'Test');
 assert.throws(()=>parseAdminOrder({...order,customer:{name:'Test'}}));
 assert.throws(()=>parseAdminOrder({...order,total_minor:0}));
 const calls=[];const api=createAdminOrdersClient('/api/admin/v1',async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify(options.method==='POST'?{ok:true}:url.includes('?')?{items:[order],nextCursor:null}:order));});
 await api.list('Имя +7','draft');await api.detail(id);await api.cancel(id,'Просьба покупателя','csrf');
 assert.ok(calls[0].url.includes('status=draft'));assert.equal(new URL(calls[0].url,'https://test').searchParams.get('search'),'Имя +7');
 assert.equal(calls[2].options.headers['X-CSRF-Token'],'csrf');assert.deepEqual(JSON.parse(calls[2].options.body),{reason:'Просьба покупателя'});
 assert.equal(calls[2].options.credentials,'same-origin');
});
test('admin order client preserves failures and rejects false cancellation success',async()=>{
 await assert.rejects(createAdminOrdersClient('/api',async()=>new Response('{}')).cancel(id,'Test','csrf'),e=>e.code==='INVALID_RESPONSE');
 await assert.rejects(createAdminOrdersClient('/api',async()=>new Response(JSON.stringify({error:'CANCELLATION_REQUIRES_REVIEW'}),{status:409})).cancel(id,'Test','csrf'),e=>e.code==='CANCELLATION_REQUIRES_REVIEW');
});

test('COD indicator is explicit and never turns pending payment into paid',()=>{
 assert.equal(parseAdminOrder(order).paymentOnDelivery,false);
 assert.equal(parseAdminOrder({...order,paymentOnDelivery:true}).payment_status,'pending');
 assert.equal(parseAdminOrder({...order,paymentOnDelivery:true}).paymentOnDelivery,true);
 for(const invalid of ['true',1,{}])assert.throws(()=>parseAdminOrder({...order,paymentOnDelivery:invalid}));
 assert.throws(()=>parseAdminOrder({...order,payment_status:'paid',paymentOnDelivery:true}));
});
