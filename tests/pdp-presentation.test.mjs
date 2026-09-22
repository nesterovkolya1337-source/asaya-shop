import {test} from 'node:test';import assert from 'node:assert/strict';
import {richSections,pdpRecommendations} from '../src/lib/pdp-presentation.ts';
import {cartRecommendations} from '../src/lib/cart-presentation.ts';
const empty={kind:'result',title:'Heading only',body:'',additionalBody:'',media:[],items:[]};
test('rich content is optional, explicitly enabled and suppresses empty sections and incomplete FAQs',()=>{
 const pdp={version:1,node:'418:2286',sections:[empty,{...empty,kind:'faq',items:[{title:'Question',body:''}]}],recommendations:[]};
 assert.deepEqual(richSections(),[]);assert.deepEqual(richSections(pdp),[]);assert.deepEqual(richSections({...pdp,enabled:false}),[]);assert.deepEqual(richSections({...pdp,enabled:true}),[]);
 assert.equal(richSections({...pdp,enabled:true,sections:[{...empty,body:'Text'}]}).length,1);
});
test('recommendations use published public candidates, exclude current, deduplicate and fill four; cart excludes cart items',()=>{
 const ps=Array.from({length:6},(_,i)=>({id:'p'+i,sku:'SKU'+i,active:true,recommendations:[]}));
 const current={...ps[0],pdp:{recommendations:['SKU2','SKU2','missing','SKU0']}};
 assert.deepEqual(pdpRecommendations([...ps,{id:'hidden',sku:'H',active:false}],current).map(p=>p.id),['p2','p1','p3','p4']);
 assert.equal(pdpRecommendations(ps.slice(0,2),current).length,1);
 assert.equal(cartRecommendations(ps,{p0:1,p1:1}).length,4);
});
