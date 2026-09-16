import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseYandexCheckoutLink,requestYandexCheckoutLink} from '../src/lib/yandex-checkout.ts';
import {checkoutCart} from '../src/lib/checkout-cart.ts';
const url='https://checkout.kit.yandex.ru/express?host=asaya.example.test&data=e30%3D';
test('Yandex redirect accepts only the official checkout destination',()=>{
 assert.equal(parseYandexCheckoutLink({url}),url);
 for(const value of [null,{}, {url:'javascript:alert(1)'},{url:url.replace('checkout.kit.yandex.ru','evil.test')},{url:url.replace('/express','/other')},{url:url.replace('https:','http:')},{url:'https://user@checkout.kit.yandex.ru/express?host=a&data=b'},{url:url+'#fragment'}])assert.throws(()=>parseYandexCheckoutLink(value));
});

test('whole cart sends every SKU with its quantity and keeps the cart when Yandex rejects it',async()=>{
 const cart={kiwi:2,avocado:3},products=[{id:'kiwi',sku:'KIWI',active:true,stock:4,price:500.01},{id:'avocado',sku:'AVOCADO',active:true,stock:8,price:600}];
 const result=checkoutCart(cart,products);assert.equal(result.valid,true);assert.equal(result.subtotalMinor,280002);
 const expected=[{sku:'KIWI',quantity:2},{sku:'AVOCADO',quantity:3}];assert.deepEqual(result.items,expected);
 await assert.rejects(requestYandexCheckoutLink('/api',result.items,async(_,options)=>{assert.deepEqual(JSON.parse(options.body),{items:expected});return Response.json({}, {status:409});}));
 assert.deepEqual(cart,{kiwi:2,avocado:3});
 for(const changed of [products.slice(0,1),[{...products[0],stock:1},products[1]],[products[0],{...products[1],active:false}]]){
  const blocked=checkoutCart(cart,changed);assert.equal(blocked.valid,false);assert.deepEqual(blocked.items,[]);
 }
 assert.equal(checkoutCart({},products).valid,false);
});
test('Yandex request sends only SKU and quantity, preserves base path, and handles rejection',async()=>{
 const items=[{sku:'КИВИ',quantity:2}];
 assert.equal(await requestYandexCheckoutLink('/shop/api/store/v1/yandex/checkout-link',items,async(path,options)=>{
  assert.equal(path,'/shop/api/store/v1/yandex/checkout-link');assert.equal(options.method,'POST');assert.deepEqual(JSON.parse(options.body),{items});assert.equal(options.cache,'no-store');assert.ok(options.signal);
  return Response.json({url});
 }),url);
 await assert.rejects(requestYandexCheckoutLink('/api',items,async()=>Response.json({}, {status:409})),/Корзина изменилась/);
 await assert.rejects(requestYandexCheckoutLink('/api',items,async()=>Response.json({}, {status:503})),/пока недоступно/);
 await assert.rejects(requestYandexCheckoutLink('/api',items,async()=>Response.json({url:'https://evil.test'})),/INVALID_RESPONSE/);
});

test('uncertain redirects retry with the same key; success and conflict start a fresh attempt',async()=>{
 const items=[{sku:'RETRY-TEST',quantity:1}],keys=[];
 const capture=options=>{const key=options.headers['Idempotency-Key'];assert.match(key,/^[a-f0-9-]{36}$/);keys.push(key);};
 await assert.rejects(requestYandexCheckoutLink('/retry',items,async(_,options)=>{capture(options);throw new Error('network');}));
 await requestYandexCheckoutLink('/retry',items,async(_,options)=>{capture(options);return Response.json({url});});assert.equal(keys[0],keys[1]);
 await assert.rejects(requestYandexCheckoutLink('/retry',items,async(_,options)=>{capture(options);return Response.json({}, {status:409});}));assert.notEqual(keys[1],keys[2]);
 await requestYandexCheckoutLink('/retry',items,async(_,options)=>{capture(options);return Response.json({url});});assert.notEqual(keys[2],keys[3]);
});
