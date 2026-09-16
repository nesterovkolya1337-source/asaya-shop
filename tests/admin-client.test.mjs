import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAdminClient,parseStaffSession,parseAdminProduct} from '../src/lib/admin-client.ts';
import {readBackendCatalog} from '../src/lib/backend-catalog.ts';
const id='00000000-0000-4000-8000-000000000001',csrf='a'.repeat(64);
const content={description:'Описание',volume:'300 мл',category:'body',setKind:'none',usage:'Применение',ingredients:'Состав',aroma:'',features:[],image:'/images/test.webp',gallery:[],badge:'Новинка',instruction:{steps:[],amount:'',tip:''},safety:'Указания',recommendations:[],sensory:[]};
const draft={sku:'NEW',name:'Новый товар',slug:'entirely-new',content,regularMinor:50000,finalMinor:45000,weightG:null,widthMm:null,heightMm:null,depthMm:null};
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status});
test('server published cards work without hardcoded drafts and unsafe media is rejected',()=>{
 const raw={items:[{sku:'NEW',name:'Новое имя',slug:'entirely-new',content,currency:'RUB',regularMinor:50000,finalMinor:45000,available:3}]};
 const item=readBackendCatalog(raw,[])[0];assert.equal(item.name,'Новое имя');assert.equal(item.price,450);assert.equal(item.badge,'Новинка');assert.equal(item.safety,'Указания');
 assert.throws(()=>readBackendCatalog({items:[{...raw.items[0],content:{...content,image:'javascript:alert(1)'}}]},[]));
 assert.throws(()=>readBackendCatalog({items:[{...raw.items[0],slug:'../admin'}]},[]));
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
 assert.throws(()=>parseAdminProduct({...p,stocks:[{...p.stocks[0],reserved:4}]}));
 assert.equal(await createAdminClient('/api',async()=>reply({error:'UNAUTHENTICATED'},401)).me(),null);
 await assert.rejects(createAdminClient('/api',async()=>{throw new Error('offline');}).me(),e=>e.code==='NETWORK_ERROR');
});

