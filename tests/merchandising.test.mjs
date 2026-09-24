import {test} from 'node:test';import assert from 'node:assert/strict';
import {selectRecommendations} from '../src/lib/recommendations.ts';
const p=(id,category='body',extra={})=>({id,sku:id,category,active:true,stock:4,stockState:'known',merchandising:{catalogOrder:0,categoryOrder:0,prioritySku:null,soldUnits:0},...extra});
test('shared PDP/cart selection aggregates unique priorities, skips unavailable/current and diversifies fallback',()=>{
 const a=p('a','body'),b=p('b','hair'),c=p('c','face'),d=p('d','sets'),e=p('e'),f=p('f');a.merchandising.prioritySku='c';b.merchandising.prioritySku='c';
 const out=selectRecommendations([a,b,c,d,e,f,p('hidden','body',{active:false}),p('zero','body',{stock:0})],['a','b']);assert.deepEqual(out.map(p=>p.id),['c','e','d','f']);assert.equal(new Set(out).size,out.length);
 assert.equal(selectRecommendations([a,b,c,d,e,f],['a'])[0].id,'c');
 assert.ok(!selectRecommendations([a,b,c,d,e,f],['a'],[],['c']).some(p=>p.id==='c'));
});
test('paid sales rank beats fallback, full sequence extends beyond the four visible slots',()=>{
 const list=['body','hair','face','sets','body','hair'].map((c,i)=>p('p'+i,c));list[5].merchandising.soldUnits=3;
 assert.equal(selectRecommendations(list,[])[0].id,'p5');assert.equal(selectRecommendations(list,[]).length,6);
});
