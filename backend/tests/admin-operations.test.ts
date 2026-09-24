import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {testDatabase} from './postgres.js';
import {AdminCatalog,emptyContent} from '../src/admin-catalog.js';
import {AdminMerchandising} from '../src/admin-merchandising.js';
import {CommerceService} from '../src/commerce.js';
let ctx:Awaited<ReturnType<typeof testDatabase>>;let actor:string;
before(async()=>{ctx=await testDatabase();actor=randomUUID();await ctx.db.pool.query("INSERT INTO users(id,role) VALUES($1,'admin')",[actor]);});after(async()=>{await ctx?.stop();});
async function seed(sku:string,category:'body'|'hair'='body'){const id=randomUUID(),api=new AdminCatalog(ctx.db),d={revision:0,sku,name:sku,slug:sku.toLowerCase(),regularMinor:10000,finalMinor:9000,weightG:null,widthMm:null,heightMm:null,depthMm:null,content:{...emptyContent,category,image:'/images/test.webp',description:'Text',ingredients:'Ingredients'}};await api.save(actor,id,d);return {id,d,api};}
test('price operation patches only canonical prices and badge, retains draft content, rejects invalid/stale and non-admin',async()=>{
 const {id,d,api}=await seed('PRICE');await api.publish(actor,id,{revision:1});await api.save(actor,id,{...d,revision:2,name:'Pending content'});
 const ops=new AdminMerchandising(ctx.db);await ops.price(actor,id,{revision:3,regularMinor:12000,finalMinor:10000,badge:'Новинка'});
 const p=(await new CommerceService(ctx.db).catalog()).find(p=>p.sku==='PRICE')!;assert.equal(p.name,'PRICE');assert.equal(p.finalMinor,10000);assert.equal(p.content.badge,'Новинка');assert.equal((await api.detail(id)).draft.name,'Pending content');
 await assert.rejects(ops.price(actor,id,{revision:3,regularMinor:12000,finalMinor:10000,badge:''}),/EDIT_CONFLICT/);
 await assert.rejects(ops.price(actor,id,{revision:4,regularMinor:100,finalMinor:101,badge:''}));
 await assert.rejects(ops.price(randomUUID(),id,{revision:4,regularMinor:100,finalMinor:100,badge:''}),/FORBIDDEN/);
 assert.equal((await ops.prices()).items.find(p=>p.id===id)!.finalMinor,10000);
});
test('merchandising rejects wrong categories, duplicates, unavailable priority; preserves stock and visibility',async()=>{
 const body=await seed('BODY'),hair=await seed('HAIR','hair');await body.api.publish(actor,body.id,{revision:1});await hair.api.publish(actor,hair.id,{revision:1});const ops=new AdminMerchandising(ctx.db);
 await assert.rejects(ops.save(actor,{scope:'body',revision:0,value:['HAIR']}),/CATEGORY_MISMATCH/);
 await assert.rejects(ops.save(actor,{scope:'body',revision:0,value:['BODY','BODY']}),/INVALID_INPUT/);
 await ops.save(actor,{scope:'body',revision:0,value:['BODY']});
 await assert.rejects(ops.save(actor,{scope:'recommendations',revision:0,value:{BODY:'HAIR'}}),/RECOMMENDATION_UNAVAILABLE/);
 const warehouse=randomUUID();await ctx.db.pool.query("INSERT INTO warehouses(id,code,name,active,address) VALUES($1,'TEST','TEST',true,'{}')",[warehouse]);
 await ctx.db.pool.query('INSERT INTO inventory_balances(product_id,warehouse_id,on_hand) VALUES($1,$2,4)',[hair.id,warehouse]);
 // Production-safe stock source for the priority validation.
 await ctx.db.pool.query("INSERT INTO stock_sources(warehouse_id,source_kind,environment,source_hash,payload_hash,generated_at,fetched_at,expires_at,healthy) VALUES($1,'cdek_ff_api','production',repeat('a',64),'hash',now(),now(),now()+interval '1 hour',true)",[warehouse]);
 await ctx.db.pool.query('INSERT INTO stock_source_items(warehouse_id,product_id,provider_quantity,quantity,listed) VALUES($1,$2,4,4,true)',[warehouse,hair.id]);
 await ops.save(actor,{scope:'recommendations',revision:0,value:{BODY:'HAIR'}});
 const p=(await new CommerceService(ctx.db).catalog(true)).find(p=>p.sku==='BODY')!;assert.equal(p.merchandising!.prioritySku,'HAIR');assert.equal(p.merchandising!.categoryOrder,0);
 assert.equal((await body.api.detail(body.id)).active,true);assert.equal((await ctx.db.pool.query('SELECT on_hand FROM inventory_balances WHERE product_id=$1',[hair.id])).rows[0].on_hand,4);
});
