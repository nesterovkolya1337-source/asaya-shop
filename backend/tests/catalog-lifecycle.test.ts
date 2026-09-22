import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {testDatabase} from './postgres.js';
import {AdminCatalog,emptyContent} from '../src/admin-catalog.js';
import {reconcilePublishedCatalog} from '../src/catalog-reconciliation.js';
import {hash,canonical} from '../src/core.js';
import {CommerceService} from '../src/commerce.js';
let ctx:Awaited<ReturnType<typeof testDatabase>>;
before(async()=>{ctx=await testDatabase();});after(async()=>ctx?.stop());
test('legacy restoration is SKU-bound, idempotent, preserves source data and stock; concurrent edits block it',async()=>{
 const actor=randomUUID(),id=randomUUID(),catalog=new AdminCatalog(ctx.db);
 await ctx.db.pool.query("INSERT INTO users(id,role) VALUES($1,'admin')",[actor]);
 const d={revision:0,sku:'LEGACY',slug:'legacy',name:'Existing public card',regularMinor:70000,finalMinor:50000,weightG:null,widthMm:null,heightMm:null,depthMm:null,
 content:{...emptyContent,description:'Existing description',ingredients:'Existing ingredients',image:'/images/existing.webp'}};
 await catalog.save(actor,id,{...d,regularMinor:null,finalMinor:null});
 await ctx.db.pool.query("INSERT INTO storefront_mappings(slug,candidate_sku,product_id,confidence,approved,reason) VALUES('legacy','LEGACY',$1,'high',true,'Confirmed SKU')",[id]);
 const product=(await ctx.db.pool.query('SELECT id,sku,name,active,sale_approved,archived_at,weight_g,width_mm,height_mm,depth_mm FROM products WHERE id=$1',[id])).rows[0];
 const editor=(await ctx.db.pool.query('SELECT revision,draft,published FROM product_editor WHERE product_id=$1',[id])).rows[0];
 const plan={version:1,entries:[{id,sku:'LEGACY',expectedHash:hash(canonical({product,editor,price:null})),draft:d,sourceUrl:'https://asaya.ru/product/legacy/',sourceSha256:'a'.repeat(64)}]};
 assert.equal((await reconcilePublishedCatalog(ctx.db,plan)).results[0]!.status,'ready');
 assert.equal((await catalog.detail(id)).active,false);
 await assert.rejects(reconcilePublishedCatalog(ctx.db,{...plan,entries:[{...plan.entries[0],sku:'WRONG'}]},true),/RECONCILIATION_CONFLICT/);
 await reconcilePublishedCatalog(ctx.db,plan,true);
 const published=await catalog.detail(id);assert.equal(published.lifecycle,'published');
 const {revision,...expectedDraft}=d; assert.deepEqual(published.draft,expectedDraft);
 const item=(await new CommerceService(ctx.db).catalog())[0]!;assert.equal(item.available,0);assert.equal(item.finalMinor,50000);assert.equal(item.name,d.name);
 assert.equal((await ctx.db.pool.query('SELECT count(*)::int AS n FROM inventory_balances')).rows[0].n,0);
 assert.equal((await reconcilePublishedCatalog(ctx.db,plan,true)).results[0]!.status,'already_applied');assert.deepEqual(await catalog.detail(id),published);
 await catalog.unpublish(actor,id,{revision:published.revision});await reconcilePublishedCatalog(ctx.db,plan,true);assert.equal((await catalog.detail(id)).lifecycle,'unpublished');
 const changed={...plan,entries:[{...plan.entries[0],sourceSha256:'b'.repeat(64)}]};await assert.rejects(reconcilePublishedCatalog(ctx.db,changed,true),/RECONCILIATION_CONFLICT/);
 // Replaying the additive archive migration cannot change publication or stock.
 await catalog.publish(actor,id,{revision:published.revision+1});const before=await catalog.detail(id);
 const sql=await readFile('migrations/029_product_archive.sql','utf8');
 await ctx.db.pool.query('ALTER TABLE products DROP COLUMN archived_at');await ctx.db.pool.query(sql);
 assert.deepEqual(await catalog.detail(id),before);
});

test('Rich Content save is draft-only; publish and disable preserve canonical price and stock',async()=>{
 const actor=randomUUID(),id=randomUUID(),catalog=new AdminCatalog(ctx.db);
 await ctx.db.pool.query("INSERT INTO users(id,role) VALUES($1,'admin')",[actor]);
 const draft={revision:0,sku:'RICH',slug:'rich-product',name:'Rich product',regularMinor:79900,finalMinor:79900,weightG:null,widthMm:null,heightMm:null,depthMm:null,content:{...emptyContent,description:'Canonical',ingredients:'Ingredients',image:'/images/existing.webp'}};
 await catalog.save(actor,id,draft);await catalog.publish(actor,id,{revision:1});
 const liveBefore=(await ctx.db.pool.query('SELECT published FROM product_editor WHERE product_id=$1',[id])).rows[0].published;
 const pdp={version:1,node:'418:2286',enabled:true,sections:[{kind:'faq',title:'Questions',body:'',additionalBody:'',media:[],items:[{title:'Question',body:'Answer'}]}],recommendations:[]};
 await catalog.save(actor,id,{...draft,revision:2,content:{...draft.content,pdp}});
 assert.deepEqual((await ctx.db.pool.query('SELECT published FROM product_editor WHERE product_id=$1',[id])).rows[0].published,liveBefore);
 await catalog.publish(actor,id,{revision:3});
 assert.equal((await ctx.db.pool.query('SELECT published FROM product_editor WHERE product_id=$1',[id])).rows[0].published.content.pdp.enabled,true);
 await catalog.save(actor,id,{...draft,revision:4,content:{...draft.content,pdp:{...pdp,enabled:false}}});await catalog.publish(actor,id,{revision:5});
 const after=(await catalog.detail(id));assert.equal(after.active,true);assert.equal(after.draft.finalMinor,79900);assert.equal(after.draft.content.description,'Canonical');assert.equal(after.draft.content.pdp!.sections[0]!.items[0]!.body,'Answer');assert.equal(after.draft.content.pdp!.enabled,false);
 assert.equal((await ctx.db.pool.query('SELECT count(*)::int n FROM inventory_balances WHERE product_id=$1',[id])).rows[0].n,0);
});
