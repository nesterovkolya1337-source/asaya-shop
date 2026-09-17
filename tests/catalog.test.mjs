import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readBackendCatalog } from '../src/lib/backend-catalog.ts';

const content={description:'Описание',volume:'300 мл',category:'hair',setKind:'none',usage:'',ingredients:'',aroma:'',features:[],image:'/images/test.webp',gallery:[],badge:'Новинка',instruction:{steps:[],amount:'',tip:''},safety:'',recommendations:[],sensory:[]};
const item={slug:'brand-new-product',sku:'TEST',name:'Серверное имя',content,currency:'RUB',regularMinor:75099,finalMinor:62050,available:3};
test('one server record supplies SKU, new slug, name, category, prices, image and stock',()=>{
 const [product]=readBackendCatalog({items:[item]});
 assert.equal(product.price,620.5);assert.equal(product.oldPrice,750.99);assert.equal(product.stock,3);
 assert.equal(product.name,item.name);assert.equal(product.image,content.image);assert.equal(product.category,content.category);assert.equal(product.badge,content.badge);assert.equal(product.sku,item.sku);assert.equal(product.id,item.slug);
});
test('empty or incomplete catalog never falls back to demo products',()=>{
 assert.deepEqual(readBackendCatalog({items:[]}),[]);
 for(const change of [{content:undefined},{name:undefined},{content:{...content,image:''}}])assert.throws(()=>readBackendCatalog({items:[{...item,...change}]}));
});
test('malformed, duplicate and unknown items cannot become displayed prices',()=>{
 for(const payload of [null,{}, {items:[{...item,finalMinor:'62050'}]}, {items:[{...item,currency:'USD'}]},
  {items:[{...item,available:-1}]}, {items:[{...item,slug:null}]}, {items:[{...item,content:null}]},
  {items:[item,item]}, {items:[item,{...item,slug:'another'}]}, {items:[{...item,regularMinor:1}]}]) assert.throws(()=>readBackendCatalog(payload));
});


test('zero quantity changes purchase quantity only and preserves product content and visibility',()=>{
 const states=[0,5,0].map(available=>readBackendCatalog({items:[{...item,available}]}));
 for(const [i,products] of states.entries()){
  assert.equal(products.length,1);const p=products[0];assert.equal(p.active,true);assert.equal(p.id,item.slug);
  assert.equal(p.stock,[0,5,0][i]);assert.equal(p.description,content.description);assert.equal(p.image,content.image);
 }
});
