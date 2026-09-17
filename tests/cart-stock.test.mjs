import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkoutCart} from '../src/lib/checkout-cart.ts';
import {readBackendCatalog} from '../src/lib/backend-catalog.ts';
const products=[
 {id:'a',sku:'A',active:true,price:1200,stock:0,stockState:'known'},
 {id:'b',sku:'B',active:true,price:120.35,stock:2,stockState:'known'},
];
test('mixed cart retains unavailable rows but excludes them from checkout and free-delivery subtotal',()=>{
 const cart={a:1,b:3},saved=structuredClone(cart),basket=checkoutCart(cart,products,true);
 assert.equal(basket.valid,true);assert.equal(basket.rows.length,2);
 assert.deepEqual(basket.items,[{sku:'B',quantity:2}]);assert.equal(basket.subtotalMinor,24070);
 assert.equal(basket.rows[0].state,'unavailable');assert.equal(basket.rows[1].state,'limited');
 assert.equal(basket.rows[1].quantity,3);assert.equal(basket.rows[1].purchasableQuantity,2);
 assert.deepEqual(cart,saved);assert.equal(checkoutCart(cart,products).valid,false);
});
test('confirmed zero, unknown, missing and inactive rows all remain saved and cannot purchase',()=>{
 const basket=checkoutCart({a:2,b:1,missing:1,c:1},[products[0],{...products[1],stockState:'unknown'},{...products[1],id:'c',active:false}],true);
 assert.equal(basket.valid,false);assert.equal(basket.subtotalMinor,0);assert.deepEqual(basket.items,[]);
 assert.deepEqual(basket.rows.map(r=>r.state),['unavailable','unknown','unknown','unknown']);
 assert.equal(basket.rows.length,4);
});
test('fresh stock restores the same saved row without readding or changing requested quantities',()=>{
 const cart={a:2};
 for(const stock of [0,5,0]){
  const basket=checkoutCart(cart,[{...products[0],stock}],true);
  assert.equal(basket.rows.length,1);assert.equal(basket.rows[0].quantity,2);
  assert.deepEqual(basket.items,stock?[{sku:'A',quantity:2}]:[]);
  assert.equal(basket.subtotalMinor,stock?240000:0);assert.equal(basket.valid,stock>0);
 }
});
test('invalid saved quantities and excessive row count never become a purchasable payload',()=>{
 for(const quantity of [1.5,101,Infinity])assert.equal(checkoutCart({b:quantity},products,true).valid,false);
 const many=Array.from({length:51},(_,i)=>({...products[1],id:String(i),sku:String(i)}));
 assert.equal(checkoutCart(Object.fromEntries(many.map(p=>[p.id,1])),many,true).valid,false);
 assert.equal(checkoutCart({},products,true).valid,false);
});
test('catalog distinguishes confirmed zero from missing availability metadata and rejects inconsistent states',()=>{
 const content={description:'Test',volume:'300 ml',category:'body',setKind:'none',usage:'',ingredients:'',aroma:'',features:[],image:'/images/test.webp',gallery:[],badge:'',instruction:{steps:[],amount:'',tip:''},safety:'',recommendations:[],sensory:[]};
 const item={slug:'test',sku:'TEST',name:'Test',content,currency:'RUB',regularMinor:10000,finalMinor:10000,available:0};
 assert.equal(readBackendCatalog({items:[item]})[0].stockState,'unknown');
 assert.equal(readBackendCatalog({items:[{...item,stockState:'known'}]})[0].stockState,'known');
 assert.equal(readBackendCatalog({items:[{...item,available:3}]})[0].stockState,'known');
 for(const change of [{stockState:'invalid'},{stockState:'unknown',available:3}])assert.throws(()=>readBackendCatalog({items:[{...item,...change}]}));
});
