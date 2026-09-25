import {test} from 'node:test';import assert from 'node:assert/strict';
import {richSections,pdpRecommendations,pdpStockLabel} from '../src/lib/pdp-presentation.ts';
import {cartRecommendations} from '../src/lib/cart-presentation.ts';
const empty={kind:'result',title:'Heading only',body:'',additionalBody:'',media:[],items:[]};
test('rich content is optional, explicitly enabled and suppresses empty sections and incomplete FAQs',()=>{
 const pdp={version:1,node:'418:2286',sections:[empty,{...empty,kind:'faq',items:[{title:'Question',body:''}]}],recommendations:[]};
 assert.deepEqual(richSections(),[]);assert.deepEqual(richSections(pdp),[]);assert.deepEqual(richSections({...pdp,enabled:false}),[]);assert.deepEqual(richSections({...pdp,enabled:true}),[]);
 assert.equal(richSections({...pdp,enabled:true,sections:[{...empty,body:'Text'}]}).length,1);
});
test('recommendations use published public candidates, exclude current, deduplicate and fill a scrollable rail; cart excludes cart items',()=>{
 const ps=Array.from({length:6},(_,i)=>({id:'p'+i,sku:'SKU'+i,active:true,stock:10,category:'body',recommendations:[]}));
 const current={...ps[0],pdp:{recommendations:['SKU2','SKU2','missing','SKU0']}};
 assert.deepEqual(pdpRecommendations([...ps,{id:'hidden',sku:'H',active:false}],current).map(p=>p.id),['p1','p2','p3','p4','p5']);
 assert.equal(pdpRecommendations(ps.slice(0,2),current).length,1);
 assert.equal(cartRecommendations(ps,{p0:1,p1:1}).length,4);
});

test('hidden blocks are omitted and restored in canonical order without erasing data',()=>{
 const sections=[{...empty,body:'First'},{...empty,kind:'feature',body:'Second',visible:false},{...empty,kind:'faq',items:[{title:'Q',body:'A'}]}];
 const pdp={version:1,node:'418:2286',enabled:true,sections,recommendations:[]};
 assert.deepEqual(richSections(pdp).map(s=>s.kind),['result','faq']);
 assert.deepEqual(richSections({...pdp,enabled:false}),[]);
 assert.equal(pdp.sections[1].body,'Second');
 assert.deepEqual(richSections({...pdp,sections:sections.map(s=>({...s,visible:true}))}).map(s=>s.kind),['result','feature','faq']);
});

test('new unavailable PDP products say soon without mutating stock or eligibility',()=>{
 for(const [badge,stock,label] of [['Новинка',0,'Скоро'],['Новинка',1,'В наличии'],['',0,'Нет в наличии'],['Бестселлер',0,'Нет в наличии']]){
  const p=Object.freeze({badge,stock});assert.equal(pdpStockLabel(p),label);assert.equal(p.stock,stock);
 }
});
