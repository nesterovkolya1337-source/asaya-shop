import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseIssues,createIntegrationClient} from '../src/lib/admin-integration-client.ts';
const id='00000000-0000-4000-8000-000000000001';
const item={id,createdAt:'2026-09-07T00:00:00Z',status:'failed',attempts:8,nextAttemptAt:null,kind:'integration.event',review:false,error:'HANDLER_FAILED',order:{id,number:'ASAYA-1'},ycp:{sessionId:'session',orderId:'external'}};
test('issues validate safe fields, pagination and discard private queue data',()=>{
 assert.deepEqual(parseIssues({items:[{...item,payload:'PRIVATE',order:{...item.order,phone:'PRIVATE'}}],nextCursor:null}),{items:[item],nextCursor:null});
 for(const change of [{id:'bad'},{attempts:-1},{attempts:1.5},{createdAt:'bad'},{status:'other'},{error:'raw secret'},{kind:'__proto__'},{order:{}},{ycp:{}}])assert.throws(()=>parseIssues({items:[{...item,...change}],nextCursor:null}));
 assert.throws(()=>parseIssues({items:[item,item],nextCursor:null}));assert.throws(()=>parseIssues({items:[],nextCursor:id}));
});
test('issues client requests filtered pages with authenticated same-origin credentials',async()=>{
 const api=createIntegrationClient('/api/admin/v1',async(url,options)=>{const q=new URL(url,'http://localhost');assert.equal(q.searchParams.get('filter'),'errors');assert.equal(q.searchParams.get('cursor'),id);assert.equal(options.credentials,'same-origin');return Response.json({items:[],nextCursor:null});});await api.list('errors',id);
});
