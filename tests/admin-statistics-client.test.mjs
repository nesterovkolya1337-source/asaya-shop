import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseStatistics,createStatisticsClient} from '../src/lib/admin-statistics-client.ts';
const stats={days:7,timezone:'Europe/Moscow',generatedAt:'2026-09-07T12:00:00Z',orders:0,paidOrders:0,cancelled:0,returned:0,salesMinor:0,units:0,daily:Array.from({length:7},(_,i)=>({date:`2026-09-0${i+1}`,orders:0,salesMinor:0,units:0})),topProducts:[]};
test('statistics client validates complete daily series, totals and staff transport',async()=>{
 assert.deepEqual(parseStatistics(stats),stats);
 for(const bad of [{...stats,orders:1},{...stats,days:90},{...stats,salesMinor:-1},{...stats,daily:[...stats.daily.slice(0,6),stats.daily[0]]},{...stats,timezone:'UTC'}])assert.throws(()=>parseStatistics(bad));
 const client=createStatisticsClient('/shop/api/admin/v1',async(url,options)=>{assert.equal(url,'/shop/api/admin/v1/statistics?days=7');assert.equal(options.credentials,'same-origin');assert.equal(options.cache,'no-store');return Response.json(stats);});
 assert.deepEqual(await client.get(7),stats);await assert.rejects(client.get(365));
 await assert.rejects(createStatisticsClient('/api',async()=>Response.json({}, {status:403})).get(7));
});
