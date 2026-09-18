import {test} from 'node:test';
import assert from 'node:assert/strict';
import {visibleBanner} from '../src/lib/storefront-banner.ts';
import {readBackendCatalog} from '../src/lib/backend-catalog.ts';
import {checkoutCart} from '../src/lib/checkout-cart.ts';
test('manual banner is absent when off; blank/unsafe optional button never appears',()=>{
 const b={enabled:false,message:'Notice',buttonText:'Open',buttonUrl:'/catalog/'};assert.equal(visibleBanner(b),null);assert.equal(visibleBanner({...b,enabled:true}).message,'Notice');assert.equal(visibleBanner({...b,enabled:true,buttonUrl:'javascript:alert(1)'}).buttonUrl,'');assert.equal(visibleBanner({...b,enabled:true,message:''}),null);
});
test('test storefront projection and original image crops survive parsing; cart ceiling returns to zero',()=>{
 const crop=JSON.stringify({desktop:{x:12,y:70,zoom:2}}),content={description:'Text',volume:'',category:'hair',setKind:'none',usage:'',ingredients:'Ingredients',aroma:'',features:[],image:'/images/old.webp',imageCrops:{'/images/old.webp':crop},gallery:[],badge:'',instruction:{steps:[],amount:'',tip:''},safety:'',recommendations:[],sensory:[]};
 const row={sku:'TEST',slug:'test',name:'Test',content,currency:'RUB',regularMinor:50000,finalMinor:50000,available:5,stockState:'known',testMode:true};
 const products=readBackendCatalog({items:[row]});assert.equal(products[0].image,'/images/old.webp');assert.equal(products[0].imageCrops['/images/old.webp'],crop);assert.equal(products[0].testMode,true);
 const basket=checkoutCart({test:8},products,true);assert.equal(basket.items[0].quantity,5);assert.equal(basket.subtotalMinor,250000);
 const off=readBackendCatalog({items:[{...row,available:0,testMode:false}]});assert.equal(checkoutCart({test:5},off,true).valid,false);assert.equal(off[0].active,true);
});
