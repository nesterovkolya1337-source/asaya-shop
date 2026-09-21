import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAdminClient,parseStaffSession,parseAdminProduct} from '../src/lib/admin-client.ts';
import {readBackendCatalog} from '../src/lib/backend-catalog.ts';
const id='00000000-0000-4000-8000-000000000001',csrf='a'.repeat(64);
const content={description:'Описание',volume:'300 мл',category:'body',setKind:'none',usage:'Применение',ingredients:'Состав',aroma:'',features:[],image:'/images/test.webp',gallery:[],badge:'Новинка',instruction:{steps:[],amount:'',tip:''},safety:'Указания',recommendations:[],sensory:[]};
const draft={sku:'NEW',name:'Новый товар',slug:'entirely-new',content,regularMinor:50000,finalMinor:45000,weightG:null,widthMm:null,heightMm:null,depthMm:null};
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status});

test('product category filter and deletion confirmation carry canonical identity and size remains typed',async()=>{
 let call;const row={id,sku:'NEW',name:'Новый',active:false,revision:2,image:'/images/test.webp',category:'face'};
 const api=createAdminClient('/api/admin/v1',async(url,options)=>{call={url,options};return reply(options.method==='GET'?{items:[row],nextOffset:null}:{outcome:'archived'});});
 assert.deepEqual((await api.list('NEW',0,'face')).items,[row]);assert.equal(new URL(call.url,'http://local').searchParams.get('category'),'face');
 assert.equal(await api.remove(id,2,'NEW',csrf),'archived');assert.equal(call.options.headers['X-CSRF-Token'],csrf);assert.deepEqual(JSON.parse(call.options.body),{revision:2,sku:'NEW',confirmed:true});
 const product={id,revision:2,active:false,hasDraft:true,publishedAt:null,draft:{...draft,content:{...content,size:{value:2,unit:'pcs'}}},stocks:[]};
 assert.deepEqual(parseAdminProduct(product).draft.content.size,{value:2,unit:'pcs'});
 assert.throws(()=>parseAdminProduct({...product,draft:{...product.draft,content:{...product.draft.content,size:{value:2,unit:'bad'}}}}));
 await assert.rejects(createAdminClient('/api',async()=>reply({ok:true})).remove(id,2,'NEW',csrf),e=>e.code==='INVALID_RESPONSE');
});
test('server published cards work without hardcoded drafts and unsafe media is rejected',()=>{
 const raw={items:[{sku:'NEW',name:'Новое имя',slug:'entirely-new',content,currency:'RUB',regularMinor:50000,finalMinor:45000,available:3}]};
 const item=readBackendCatalog(raw)[0];assert.equal(item.name,'Новое имя');assert.equal(item.price,450);assert.equal(item.badge,'Новинка');assert.equal(item.safety,'Указания');
 assert.throws(()=>readBackendCatalog({items:[{...raw.items[0],content:{...content,image:'javascript:alert(1)'}}]}));
 assert.throws(()=>readBackendCatalog({items:[{...raw.items[0],slug:'../admin'}]}));
});
test('admin session rejects customer role and malformed access tokens',()=>{
 assert.deepEqual(parseStaffSession({user:{id,role:'admin'},csrfToken:csrf}),{user:{id,role:'admin'},csrfToken:csrf});
 assert.throws(()=>parseStaffSession({user:{id,role:'customer'},csrfToken:csrf}));
 assert.throws(()=>parseStaffSession({user:{id,role:'admin'},csrfToken:'bad'}));
});
test('admin mutations carry server revision and CSRF; malformed success and conflicts stay errors',async()=>{
 const calls=[];
 const api=createAdminClient('/api/admin/v1',async(url,options)=>{calls.push({url,options});return reply({id,revision:3});});
 await api.save(id,draft,2,csrf);assert.equal(calls[0].options.method,'PUT');assert.equal(calls[0].options.headers['X-CSRF-Token'],csrf);
 assert.equal(JSON.parse(calls[0].options.body).revision,2);assert.equal(calls[0].options.credentials,'same-origin');
 await assert.rejects(createAdminClient('/api',async()=>reply({id,revision:1})).save(id,draft,2,csrf),e=>e.code==='INVALID_RESPONSE');
 await assert.rejects(createAdminClient('/api',async()=>reply({error:'EDIT_CONFLICT'},409)).publish(id,2,csrf),e=>e.code==='EDIT_CONFLICT');
 await assert.rejects(createAdminClient('/api',async()=>reply({})).unpublish(id,2,csrf),e=>e.code==='INVALID_RESPONSE');
});
test('admin product validates stock reservations and session lookup distinguishes errors from guests',async()=>{
 const p={id,revision:2,active:true,hasDraft:true,publishedAt:null,draft,stocks:[{warehouseId:id,name:'Test',active:true,onHand:3,reserved:2}]};
 assert.equal(parseAdminProduct(p).stocks[0].reserved,2);
 const source={kind:'cdek_ff_api',generatedAt:'2026-09-21T12:00:00Z',fetchedAt:'2026-09-21T12:00:00Z',expiresAt:'2026-09-21T12:15:00Z',healthy:true,available:1,reportedQuantity:3};
 assert.equal(parseAdminProduct({...p,stocks:[{...p.stocks[0],source}]}).stocks[0].source.kind,'cdek_ff_api');
 assert.throws(()=>parseAdminProduct({...p,stocks:[{...p.stocks[0],source:{...source,kind:'unknown'}}]}));
 assert.throws(()=>parseAdminProduct({...p,stocks:[{...p.stocks[0],reserved:4}]}));
 assert.equal(await createAdminClient('/api',async()=>reply({error:'UNAUTHENTICATED'},401)).me(),null);
 await assert.rejects(createAdminClient('/api',async()=>{throw new Error('offline');}).me(),e=>e.code==='NETWORK_ERROR');
});

