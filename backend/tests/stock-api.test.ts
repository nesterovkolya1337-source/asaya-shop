import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CdekStockApi,createStockSource} from '../src/cdek-stock-source.js';
import {stockSourceHash} from '../src/stock-state.js';
const at=new Date('2026-09-21T12:00:00Z');
const config={kind:'cdek_ff_api',warehouseId:'18d1c0ba-86e3-46c9-8a08-ad555326bc62',accountId:'asaya',externalWarehouseId:'23401',shopId:220216,environment:'production',login:'fixture-login',password:'fixture-password'};
const product=(id=1,article:string|null='SKU-1',items:unknown=[{count:24,state:'normal',warehouse:23401}])=>({id,article,items,inventoryUpdated:'2026-09-18 13:00:00+00',_embedded:{shop:{id:220216}}});
const page=(rows:unknown[],number=1,pages=1,total=rows.length)=>({page:number,page_count:pages,page_size:100,total_items:total,_embedded:{product_offer:rows}});
const response=(data:unknown,headers:Record<string,string>={})=>new Response(JSON.stringify(data),{headers:{date:at.toUTCString(),...headers}});
test('official read-only Basic request, article mapping, warehouse/state filters and old last-mutation date',async()=>{
 const source=new CdekStockApi(config,async(url,init)=>{
  assert.equal(url,'https://cdek.orderadmin.ru/api/products/offer?page=1&per_page=100');assert.equal(init?.method,'GET');assert.equal(init?.redirect,'error');
  assert.equal(new Headers(init?.headers).get('authorization'),'Basic '+Buffer.from('fixture-login:fixture-password').toString('base64'));
  return response(page([product(1,'SKU-1',[{count:24,state:'normal',warehouse:23401},{count:3,state:'booked',warehouse:23401},{count:8,state:'new',warehouse:23401},{count:7,state:'shipped',warehouse:23401},{count:500,state:'normal',warehouse:7460}]),product(2,null,null),product(3,'SKU-2',null)]));
 },()=>at);
 const snapshot=await source.read();assert.equal(+snapshot.generatedAt,+at);assert.deepEqual(snapshot.items.map(({sku,quantity})=>({sku,quantity})),[{sku:'SKU-1',quantity:24},{sku:'SKU-2',quantity:0}]);
 assert.ok(!JSON.stringify(source).includes('fixture-login'));assert.ok(!JSON.stringify(source).includes('fixture-password'));
 assert.equal(stockSourceHash(source.settings),stockSourceHash(new CdekStockApi({...config,password:'rotated'}).settings));
 assert.ok(createStockSource(config) instanceof CdekStockApi);
});
test('all pages must complete; changed total, duplicate SKU/id and partial response fail closed',async()=>{
 let calls=0;const source=new CdekStockApi(config,async()=>{calls++;return response(page([product(calls,'SKU-'+calls)],calls,2,2));},()=>at);
 assert.equal((await source.read()).items.length,2);assert.equal(calls,2);
 for(const second of [page([product(2,'SKU-2')],2,2,3),page([product(2)],2,2,2),page([product(1,'SKU-2')],2,2,2)]){
  let n=0;await assert.rejects(new CdekStockApi(config,async()=>response(++n===1?page([product()],1,2,2):second),()=>at).read(),/STOCK_SOURCE_UNAVAILABLE/);
 }
 await assert.rejects(new CdekStockApi(config,async()=>response(page([product()],1,1,2)),()=>at).read(),/STOCK_SOURCE_UNAVAILABLE/);
});
test('auth errors are sanitized; rate limits, stale cache and stale server responses rejected',async()=>{
 for(const status of [401,403])await assert.rejects(new CdekStockApi(config,async()=>new Response('fixture-password',{status}),()=>at).read(),e=>e instanceof Error&&e.message==='STOCK_SOURCE_UNAUTHORIZED');
 await assert.rejects(new CdekStockApi(config,async()=>new Response('',{status:429,headers:{'retry-after':'123'}}),()=>at).read(),e=>(e as {retryAfterSeconds:number}).retryAfterSeconds===123);
 for(const headers of [{age:'1800'},{date:'Fri, 18 Sep 2026 12:00:00 GMT'}] as Record<string,string>[])await assert.rejects(new CdekStockApi(config,async()=>response(page([product()]),headers),()=>at).read(),/STOCK_SOURCE_STALE/);
 await assert.rejects(new CdekStockApi(config,async()=>new Response('fixture-password',{status:500}),()=>at).read());
});
test('malformed stock never becomes zero; service records with physical inventory and missing dates rejected',async()=>{
 for(const row of [product(1,'SKU-1',[{count:-1,state:'normal',warehouse:23401}]),product(1,null),{...product(),inventoryUpdated:null},product(1,'SKU-1',[{count:5,state:'unexpected',warehouse:23401}])])
  await assert.rejects(new CdekStockApi(config,async()=>response(page([row])),()=>at).read(),/STOCK_SOURCE_UNAVAILABLE/);
 await assert.rejects(new CdekStockApi(config,async()=>response(page([{...product(),_embedded:{shop:{id:999}}}])),()=>at).read(),/STOCK_SOURCE_UNAVAILABLE/);
 assert.throws(()=>new CdekStockApi({...config,externalWarehouseId:'7460'}),/STOCK_API_CONFIG_INVALID/);
});
