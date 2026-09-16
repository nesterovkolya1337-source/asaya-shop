import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCheckoutClient,parseCheckoutResult} from '../src/lib/auth-client.ts';
import {checkoutCart} from '../src/lib/checkout-cart.ts';
const id='00000000-0000-4000-8000-000000000001',key='test-checkout-key-00001';
const quote={deliveryQuoteId:id,amountMinor:12345,currency:'RUB',label:'Test only',expiresAt:'2026-09-06T10:05:00Z'};
const result={orderId:id,checkoutId:id,publicNumber:'ASAYA-10001',totalMinor:62345};
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status});
test('quote uses only address and cart; checkout replays identical body and key with CSRF',async()=>{
 const calls=[];
 const api=createCheckoutClient('/api',async(url,options)=>{calls.push({url,options});return reply(url.endsWith('quotes')?quote:result);});
 const items=[{sku:'TEST',quantity:1}];assert.equal((await api.quote(items,{city:'City',address:'Street 1'},'csrf')).amountMinor,12345);
 const body={items,deliveryQuoteId:id,customer:{name:'Test',phone:'+79990000000'},consent:{offerVersion:'test-v1',privacyVersion:'test-v1',marketing:false},expectedTotalMinor:62345};
 assert.deepEqual(await api.create(body,key,'csrf'),result);assert.deepEqual(await api.create(body,key,'csrf'),result);
 assert.equal(calls[1].options.headers['Idempotency-Key'],key);assert.equal(calls[1].options.headers['X-CSRF-Token'],'csrf');
 assert.equal(calls[1].options.body,calls[2].options.body);
 assert.ok(calls.every(c=>c.options.credentials==='same-origin'&&c.options.cache==='no-store'));
 assert.deepEqual(JSON.parse(calls[0].options.body),{items,address:{city:'City',address:'Street 1'}});
});
test('recovery distinguishes missing attempt from network error and validates saved order',async()=>{
 assert.equal(await createCheckoutClient('/api',async()=>reply({error:'CHECKOUT_NOT_FOUND'},404)).recover(key),null);
 await assert.rejects(createCheckoutClient('/api',async()=>{throw new Error('offline');}).recover(key),e=>e.code==='NETWORK_ERROR');
 assert.deepEqual(await createCheckoutClient('/api',async()=>reply(result)).recover(key),result);
 for(const r of [{...result,totalMinor:-1},{...result,orderId:'bad'},{...result,publicNumber:'invented'}])assert.throws(()=>parseCheckoutResult(r));
});
test('invalid delivery response cannot become free delivery',async()=>{
 for(const q of [{...quote,amountMinor:-1},{...quote,amountMinor:0.1},{...quote,currency:'USD'},{...quote,expiresAt:'bad'}])
  await assert.rejects(createCheckoutClient('/api',async()=>reply(q)).quote([],{city:'City',address:'Street'},'csrf'),e=>e.code==='INVALID_RESPONSE');
 await assert.rejects(createCheckoutClient('/api',async()=>reply({error:'DELIVERY_UNAVAILABLE'},503)).quote([],{city:'City',address:'Street'},'csrf'),e=>e.code==='DELIVERY_UNAVAILABLE');
});
test('cart totals use kop and unavailable rows block checkout without disappearing',()=>{
 const products=[{id:'a',sku:'TEST',active:true,price:12.34,stock:3}];
 const cart=checkoutCart({a:3},products);assert.equal(cart.subtotalMinor,3702);assert.equal(cart.valid,true);
 assert.equal(checkoutCart({a:4},products).valid,false);
 const missing=checkoutCart({missing:1},products);assert.equal(missing.rows.length,1);assert.equal(missing.valid,false);
 assert.equal(checkoutCart({a:1.5},products).valid,false);
 assert.equal(checkoutCart({},products).valid,false);
 assert.equal(checkoutCart({a:1,b:2},products).signature,checkoutCart({b:2,a:1},products).signature);
});

