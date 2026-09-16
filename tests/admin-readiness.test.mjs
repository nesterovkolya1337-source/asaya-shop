import {test} from 'node:test';import assert from 'node:assert/strict';
import {parseReadiness,createReadinessClient} from '../src/lib/admin-readiness-client.ts';
const sample=()=>({total:1,publishedCount:0,warehouseCount:0,catalogOnly:true,ycpConfigured:false,items:[{id:'00000000-0000-4000-8000-000000000001',sku:'A',name:'Item',published:false,publicationIssues:['image'],deliveryIssues:['stock']}],nextOffset:null});
test('readiness client rejects unknown checks, malformed counts and duplicate cards',()=>{
 assert.equal(parseReadiness({...sample(),token:'do not project'}).items.length,1);assert.equal('token' in parseReadiness({...sample(),token:'hidden'}),false);
 for(const update of [{publishedCount:2},{warehouseCount:-1},{nextOffset:0},{items:[{...sample().items[0],publicationIssues:['unknown']}]},{total:2,items:[...sample().items,...sample().items]}])assert.throws(()=>parseReadiness({...sample(),...update}));
});
test('readiness preserves deployment prefix and rejects pagination that does not advance correctly',async()=>{
 let url='';const client=createReadinessClient('/manage/api/admin/v1',async u=>{url=String(u);return new Response(JSON.stringify(sample()));});await client.get();assert.equal(url,'/manage/api/admin/v1/readiness?offset=0');
 await assert.rejects(createReadinessClient('/api',async()=>new Response(JSON.stringify({...sample(),total:100,nextOffset:50}))).get());
});
