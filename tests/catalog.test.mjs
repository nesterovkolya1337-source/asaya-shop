import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readBackendCatalog } from '../src/lib/backend-catalog.ts';

const drafts=[{id:'shampoo',name:'Шампунь',price:500,oldPrice:700,stock:20,badge:'Новинка',active:true,image:'/shampoo.webp'}];
const item={slug:'shampoo',sku:'TEST',currency:'RUB',regularMinor:75099,finalMinor:62050,available:3};
test('server amounts and stock replace demo values while storefront content stays intact',()=>{
 const [product]=readBackendCatalog({items:[item]},drafts);
 assert.equal(product.price,620.5);assert.equal(product.oldPrice,750.99);assert.equal(product.stock,3);
 assert.equal(product.name,'Шампунь');assert.equal(product.image,'/shampoo.webp');assert.equal(product.badge,'');
});
test('empty catalog never falls back to demo products',()=>assert.deepEqual(readBackendCatalog({items:[]},drafts),[]));
test('malformed, duplicate and unknown items cannot become displayed prices',()=>{
 for(const payload of [null,{}, {items:[{...item,finalMinor:'62050'}]}, {items:[{...item,currency:'USD'}]},
  {items:[{...item,available:-1}]}, {items:[{...item,slug:null}]}, {items:[{...item,slug:'unknown'}]},
  {items:[item,item]}, {items:[{...item,regularMinor:1}]}]) assert.throws(()=>readBackendCatalog(payload,drafts));
});
