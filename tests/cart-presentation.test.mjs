import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cartRecommendations,deliveryProgress} from '../src/lib/cart-presentation.ts';
test('recommendations are stable public-catalog selections, exclude saved cart and inactive items, do not mutate catalog',()=>{
 const items=[{id:'current',sku:'A',active:true},{id:'hidden',sku:'H',active:false},{id:'no-sku',active:true},...['e','d','c','b','a'].map(id=>({id,sku:id,active:true,stock:0}))];
 const before=structuredClone(items);
 assert.deepEqual(cartRecommendations(items,{current:2}).map(p=>p.id),['a','b','c','d']);
 assert.deepEqual(items,before);
 assert.deepEqual(cartRecommendations([],{}),[]);
});
test('delivery progress uses server remainder and threshold, clamps below/at/above threshold without recomputing prices',()=>{
 const q={settings:{freeShippingMinor:100000}};
 for(const [remainder,expected] of [[100000,0],[75000,25],[0,100],[-100,100],[110000,0]])assert.equal(deliveryProgress({...q,shippingRemainingMinor:remainder}),expected);
 assert.equal(deliveryProgress({settings:{freeShippingMinor:0},shippingRemainingMinor:0}),100);
});
