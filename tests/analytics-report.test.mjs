import {test} from 'node:test';
import assert from 'node:assert/strict';
import {analyticsFixture as data} from './fixtures/analytics-report.mjs';
import {parseAnalytics,createAnalyticsClient} from '../src/lib/analytics-client.ts';
import {analyticsExport} from '../src/lib/analytics-export.ts';
test('analytics reports reconcile daily totals, reject invalid dates and preserve unknown refund amounts',()=>{
 assert.deepEqual(parseAnalytics(data),data);
 for(const bad of [{...data,summary:{...data.summary,salesMinor:1}},{...data,period:{...data.period,to:'2026-02-30'}},{...data,daily:[...data.daily,data.daily[0]]},{...data,products:[...data.products,...data.products]}])assert.throws(()=>parseAnalytics(bad));
 const parsed=parseAnalytics({...data,customerEmail:'private',products:[{...data.products[0],phone:'private'}]});assert.ok(!JSON.stringify(parsed).includes('private'));assert.equal(parsed.summary.returnedMinor,null);
});
test('all CSV views preserve cents, null vs zero, filters and protect formula-like product names',()=>{
 for(const kind of ['summary','daily','products']){const r=analyticsExport(data,kind);assert.ok(r.content.startsWith('\uFEFF'));assert.ok(r.content.includes('1000,01'));assert.ok(r.content.includes('Нет подтверждённых данных'));assert.ok(r.content.includes('2026-09-11'));assert.ok(r.content.includes('Europe/Moscow'));}
 const full=analyticsExport(data,'products');assert.ok(full.content.includes('"\'00123"'));assert.equal(full.content.split('\r\n').length,3);
 for(const name of ['=HYPERLINK("x")','  +1','\t@SUM(A1)','-1']){const csv=analyticsExport({...data,products:[{...data.products[0],name}]},'products').content;assert.ok(csv.includes('"\''+name.replaceAll('"','""')+'"'));}
 assert.throws(()=>analyticsExport(data,'bad'));
});
test('analytics transport encodes selected filters, uses staff credentials and rejects unauthenticated results',async()=>{
 const client=createAnalyticsClient('/manage/api/admin/v1',async(url,options)=>{assert.equal(url,'/manage/api/admin/v1/analytics?from=2026-09-11&to=2026-09-17&search=A%26B&category=hair');assert.equal(options.credentials,'same-origin');assert.equal(options.cache,'no-store');return Response.json(data);});
 await client.get({from:'2026-09-11',to:'2026-09-17',search:'A&B',category:'hair'});
 await assert.rejects(createAnalyticsClient('/api',async()=>Response.json({error:'UNAUTHENTICATED'},{status:401})).get({days:'7'}));
});
