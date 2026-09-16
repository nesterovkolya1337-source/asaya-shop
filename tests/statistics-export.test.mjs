import {test} from 'node:test';
import assert from 'node:assert/strict';
import {statisticsExport} from '../src/lib/statistics-export.ts';
const stats={days:7,timezone:'Europe/Moscow',generatedAt:'2026-09-07T12:00:00Z',orders:1,paidOrders:1,cancelled:0,returned:0,salesMinor:10001,units:1,daily:Array.from({length:7},(_,i)=>({date:`2026-09-0${i+1}`,orders:i===0?1:0,salesMinor:i===0?10001:0,units:i===0?1:0})),topProducts:[{sku:'00123',name:'Гель; "Киви"\n500 мл',units:1,salesMinor:10001}]};
test('daily CSV preserves cents, zero days, date range and calculation rules without changing source',()=>{
 const before=JSON.stringify(stats),r=statisticsExport(stats,'daily');
 assert.equal(r.filename,'ASAYA-daily-2026-09-01-2026-09-07.csv');assert.ok(r.content.startsWith('\uFEFF"Дата";'));
 assert.ok(r.content.includes('"2026-09-01";"1";"100,01";"1";'));assert.ok(r.content.includes('"2026-09-02";"0";"0,00";"0";'));
 assert.equal(r.content.split('\r\n').length,9);assert.ok(r.content.includes('Europe/Moscow'));assert.ok(r.content.includes('без доставки'));assert.equal(JSON.stringify(stats),before);
});
test('product CSV quotes delimiters and newlines, preserves SKU zeros, and protects spreadsheet formulas',()=>{
 const r=statisticsExport(stats,'top-products');assert.ok(r.content.includes('"\'00123"'));assert.ok(r.content.includes('"Гель; ""Киви""\n500 мл"'));
 for(const name of ['=1+1','+1+1','-1+1','@SUM(A1)','  =1+1','\t=1+1']){
  const content=statisticsExport({...stats,topProducts:[{...stats.topProducts[0],name}]},'top-products').content;assert.ok(content.includes('"\''+name+'"'));
 }
 assert.throws(()=>statisticsExport({...stats,salesMinor:1},'daily'));assert.throws(()=>statisticsExport(stats,'invalid'));
});
