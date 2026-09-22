import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseStockReport,createStockClient} from '../src/lib/stock-client.ts';
const data={configured:true,source:{mappingWarnings:[],externalWarehouseId:'23401',environment:'production',syncedAt:'2026-09-17T12:00:00Z',sourceUpdatedAt:'2026-09-17T11:50:00Z',expiresAt:'2026-09-17T12:15:00Z',nextAttemptAt:'2026-09-17T12:05:00Z',syncStatus:'fresh',lastError:null},items:[{productId:'id',sku:'A',name:'Canonical',category:'body',image:null,quantity:0,quantityState:'known'},{productId:'missing',sku:'B',name:'Missing',category:null,image:null,quantity:null,quantityState:'missing'}]};
test('stock UI preserves missing vs zero and strips unlisted fields',()=>{
 assert.deepEqual(parseStockReport({...data,password:'secret'}),data);
 for(const item of [{...data.items[0],quantity:-1},{...data.items[0],quantity:null},{...data.items[1],quantity:0}])assert.throws(()=>parseStockReport({...data,items:[item]}));
 assert.throws(()=>parseStockReport({...data,items:[data.items[0],data.items[0]]}));
 assert.throws(()=>parseStockReport({...data,source:{...data.source,syncedAt:'bad'}}));
});
test('stock refresh sends only empty body with staff CSRF and respects server outcomes',async()=>{
 const client=createStockClient('/manage/api/admin/v1',async(url,options)=>{assert.equal(options.credentials,'same-origin');assert.equal(options.cache,'no-store');if(options.method==='POST'){assert.equal(url,'/manage/api/admin/v1/analytics/stocks/refresh');assert.equal(options.headers['X-CSRF-Token'],'csrf');assert.equal(options.body,'{}');return Response.json({outcome:'not_due'});}return Response.json(data);});
 assert.deepEqual(await client.get(),data);assert.equal(await client.refresh('csrf'),'not_due');
 await assert.rejects(createStockClient('/api',async()=>Response.json({outcome:'invented'})).refresh('csrf'));
});

test('non-blocking mapping warning preserves offending articles and supports older source responses',()=>{
 const source={...data.source,lastError:null,syncStatus:'fresh',mappingWarnings:['UNKNOWN']};
 assert.deepEqual(parseStockReport({...data,source}).source.mappingWarnings,['UNKNOWN']);
 assert.throws(()=>parseStockReport({...data,source:{...source,mappingWarnings:[123]}}));
 const {mappingWarnings,...older}=data.source;assert.deepEqual(parseStockReport({...data,source:older}).source.mappingWarnings,[]);
});
