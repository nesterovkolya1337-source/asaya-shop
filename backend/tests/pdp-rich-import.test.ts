import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {testDatabase} from './postgres.js';
import {AdminCatalog,emptyContent} from '../src/admin-catalog.js';
import {importPdpRichContent} from '../src/pdp-rich-import.js';
import {parsePdpContent,pdpMediaSources} from '../src/pdp-content.js';
import {CommerceService} from '../src/commerce.js';
const entries=JSON.parse(await readFile('data/pdp-rich-content-v2.json','utf8')) as Array<{sku:string;pdp:unknown}>;
let ctx:Awaited<ReturnType<typeof testDatabase>>;
before(async()=>{ctx=await testDatabase();});after(async()=>ctx?.stop());
test('all imported copy is verbatim source text, all original media exists, FAQ answers belong to Figma variants',async()=>{
 const sources=JSON.parse(await readFile('data/pdp-rich-content-v2-sources.json','utf8'));
 assert.equal(entries.length,12);assert.equal(new Set(entries.map(e=>e.sku)).size,12);
 for(const e of entries){const p=parsePdpContent(e.pdp);const copy=p.sections.flatMap(s=>[s.eyebrow,s.title,s.body,s.additionalBody,...s.items.flatMap(i=>[i.title,i.body])]).filter(Boolean);
  for(const text of copy)assert.ok(sources.texts.some((s:{sku:string;text:string})=>s.sku===e.sku&&s.text===text),'Non-verbatim copy: '+text);
  for(const src of pdpMediaSources(p))await access('../public'+src);
  if(e.sku.startsWith('1S-BA-02')){const faq=p.sections.find(s=>s.kind==='faq')!;assert.equal(faq.items.length,5);assert.ok(faq.items.every(i=>i.title&&i.body));}
  if(e.sku.startsWith('1S-HK'))assert.equal(p.sections.find(s=>s.kind==='howTo')!.items.length,4);
 }
});
test('imports actual Figma content to editable drafts, preserves published/canonical/stock, replay preserves manager changes',async()=>{
 const actor=randomUUID(),catalog=new AdminCatalog(ctx.db);await ctx.db.pool.query("INSERT INTO users(id,role) VALUES($1,'admin')",[actor]);
 const ids=[];
 for(const e of entries){const id=randomUUID();ids.push(id);await catalog.save(actor,id,{revision:0,sku:e.sku,slug:'rich-'+e.sku.toLowerCase(),name:'Canonical '+e.sku,regularMinor:79900,finalMinor:71900,weightG:null,widthMm:null,heightMm:null,depthMm:null,content:{...emptyContent,description:'Canonical description',ingredients:'Canonical ingredients',image:'/images/existing.webp'}});await catalog.publish(actor,id,{revision:1});}
 const before=(await ctx.db.pool.query('SELECT product_id,published FROM product_editor ORDER BY product_id')).rows;
 assert.ok((await importPdpRichContent(ctx.db,entries,actor)).every(r=>r.status==='ready'));
 assert.ok((await importPdpRichContent(ctx.db,entries,actor,true)).every(r=>r.status==='draft_imported'));
 assert.deepEqual((await ctx.db.pool.query('SELECT product_id,published FROM product_editor ORDER BY product_id')).rows,before);
 assert.ok((await importPdpRichContent(ctx.db,entries,actor,true)).every(r=>r.status==='already_imported'));
 for(let i=0;i<ids.length;i++){const d=await catalog.detail(ids[i]!);assert.deepEqual(d.draft.content.pdp,parsePdpContent(entries[i]!.pdp));assert.equal(d.active,true);assert.equal(d.draft.content.description,'Canonical description');assert.equal(d.draft.finalMinor,71900);assert.equal(d.stocks.length,0);}
 const id=ids[0]!;let d=await catalog.detail(id);await catalog.publish(actor,id,{revision:d.revision});
 const publicItem=(await new CommerceService(ctx.db).catalog()).find(p=>p.sku===entries[0]!.sku)!;assert.deepEqual(publicItem.content.pdp,parsePdpContent(entries[0]!.pdp));assert.equal(publicItem.available,0);
 d=await catalog.detail(id);d.draft.content.pdp!.sections[0]!.title='Manager edit';await catalog.save(actor,id,{...d.draft,revision:d.revision});
 assert.equal((await importPdpRichContent(ctx.db,entries,actor,true))[0]!.status,'existing_content_preserved');
 assert.equal((await catalog.detail(id)).draft.content.pdp!.sections[0]!.title,'Manager edit');
 assert.equal((await ctx.db.pool.query('SELECT count(*)::int n FROM inventory_balances')).rows[0].n,0);
 await assert.rejects(importPdpRichContent(ctx.db,entries,randomUUID(),true),/FORBIDDEN/);
});
