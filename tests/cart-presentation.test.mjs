import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cartRecommendations,deliveryProgress} from '../src/lib/cart-presentation.ts';
test('recommendations are stable public-catalog selections, exclude saved cart and inactive items, do not mutate catalog',()=>{
 const items=[{id:'current',sku:'A',active:true},{id:'hidden',sku:'H',active:false},{id:'no-sku',active:true},...['e','d','c','b','a'].map(id=>({id,sku:id,active:true,stock:4,category:'body'}))];
 const before=structuredClone(items);
 assert.deepEqual(cartRecommendations(items,{current:2}).map(p=>p.id),['a','b','c','d','e']);
 assert.deepEqual(items,before);
 assert.deepEqual(cartRecommendations([],{}),[]);
});
test('delivery progress uses server remainder and threshold, clamps below/at/above threshold without recomputing prices',()=>{
 const q={settings:{freeShippingMinor:100000}};
 for(const [remainder,expected] of [[100000,0],[75000,25],[0,100],[-100,100],[110000,0]])assert.equal(deliveryProgress({...q,shippingRemainingMinor:remainder}),expected);
 assert.equal(deliveryProgress({settings:{freeShippingMinor:0},shippingRemainingMinor:0}),100);
});

import {formatMinorRubles} from '../src/lib/money-format.ts';
test('customer money hides only zero kopecks without changing the value',()=>{
 const fmt=n=>formatMinorRubles(n).replace(/\s/g,' ');
 assert.equal(fmt(95000),'950 ₽');assert.equal(fmt(100000),'1 000 ₽');assert.equal(fmt(71910),'719,10 ₽');assert.equal(fmt(71901),'719,01 ₽');
});
