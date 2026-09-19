import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parsePdpContent,pdpMediaSources} from '../src/pdp-content.js';
import {contentSchema,emptyContent} from '../src/admin-catalog.js';
const section={kind:'result',title:'Результат',body:'Описание',additionalBody:'',media:[{src:'/images/pdp/master.png',crop:JSON.stringify({desktop:{x:40,y:60,zoom:1.2}})}],items:[{title:'Первый',body:''},{title:'Второй',body:'',media:{src:'/images/pdp/step.png'}}]};
const pdp={version:1,node:'315:1065',sections:[section],recommendations:['1S-HK-01']};
test('PDP content preserves ordered data, canonical SKUs and independent non-destructive crop metadata',()=>{
 assert.deepEqual(parsePdpContent(pdp),pdp);
 assert.deepEqual(pdpMediaSources(parsePdpContent(pdp)),['/images/pdp/master.png','/images/pdp/step.png']);
 const changed=structuredClone(pdp);changed.sections[0]!.media[0]!.crop=JSON.stringify({desktop:{x:20,y:10,zoom:2}});
 assert.equal(parsePdpContent(changed).sections[0]!.media[0]!.src,pdp.sections[0]!.media[0]!.src);
 assert.deepEqual(contentSchema.parse({...emptyContent,pdp}).pdp,pdp);
 assert.equal(contentSchema.parse(emptyContent).pdp,undefined);
});
test('PDP rejects unapproved nodes, duplicate sections, unsafe media, malformed crops and unbounded content',()=>{
 for(const bad of [{...pdp,node:'150:1609'},{...pdp,sections:[section,section]},{...pdp,sections:[{...section,media:[{src:'javascript:alert(1)'}]}]},{...pdp,sections:[{...section,media:[{src:'/images/x.png',crop:'{}'}]}]},{...pdp,sections:[{...section,body:'x'.repeat(10001)}]}])assert.throws(()=>parsePdpContent(bad));
});


test('PDP migration preserves 16 published launch products, nine drafts and canonical prices; crop edits publish explicitly',async()=>{
 const {testDatabase}=await import('./postgres.js');const {readFile}=await import('node:fs/promises');const {randomUUID}=await import('node:crypto');
 const {AdminCatalog}=await import('../src/admin-catalog.js');const {StaffAuth}=await import('../src/staff-auth.js');const {CommerceService}=await import('../src/commerce.js');
 const ctx=await testDatabase();
 try{
  const actor=await new StaffAuth(ctx.db,'isolated-staff-master-key-at-least-32-characters').provision('pdp@example.test','Only-local-password-938','GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  const admin=new AdminCatalog(ctx.db),commerce=new CommerceService(ctx.db);
  const skus=['1S-BA-02-02','1S-BA-02-01','1S-BA-02-04','1S-BA-02-03','1S-BA-02-05','1S-FL-02','1S-FL-01','1S-HK-02','1S-HK-03','1S-HK-01','1S-HK-05','1S-HK-04','1S-BA-01','1S-BA-03','UNCHANGED-1','UNCHANGED-2',...Array.from({length:9},(_,n)=>'SET-'+n)];
  const ids:string[]=[];
  for(const [n,sku] of skus.entries()){
   const id=randomUUID();ids.push(id);
   await admin.save(actor,id,{revision:0,sku,name:'Original '+sku,slug:'pdp-'+n,regularMinor:123456,finalMinor:120123,weightG:null,widthMm:null,heightMm:null,depthMm:null,content:{...emptyContent,description:'Existing description',ingredients:'Existing INCI',image:'/images/original.webp',instruction:{steps:['First verified step','Second verified step','Third verified step','Fourth verified step'],amount:'',tip:''}}});
   if(n<16)await admin.publish(actor,id,{revision:1});
  }
  const canonical=async()=>({products:(await ctx.db.pool.query('SELECT * FROM products ORDER BY id')).rows,prices:(await ctx.db.pool.query('SELECT * FROM product_prices ORDER BY product_id')).rows,stock:(await ctx.db.pool.query('SELECT * FROM inventory_balances ORDER BY product_id')).rows});
  const before=await canonical();const unchanged=(await ctx.db.pool.query('SELECT * FROM product_editor WHERE product_id=ANY($1::uuid[]) ORDER BY product_id',[ids.slice(12)])).rows;
  const sql=await readFile(new URL('../../migrations/031_product_pdp_content.sql',import.meta.url),'utf8');
  await ctx.db.pool.query(sql);assert.deepEqual(await canonical(),before);
  assert.deepEqual((await ctx.db.pool.query('SELECT * FROM product_editor WHERE product_id=ANY($1::uuid[]) ORDER BY product_id',[ids.slice(12)])).rows,unchanged);
  assert.equal((await commerce.catalog()).length,16);
  for(const id of ids.slice(0,12)){
   const detail=await admin.detail(id);const content=parsePdpContent(detail.draft.content.pdp);assert.ok(content.sections.length);
   assert.equal(content.sections.find(s=>s.kind==='howTo')!.items.length,4);assert.ok(content.sections.find(s=>s.kind==='faq')!.items.every(i=>i.title&&i.body===''));
  }
  const first=await admin.detail(ids[0]!);const edited=structuredClone(first.draft);edited.content.pdp!.sections[0]!.media[0]!.crop=JSON.stringify({desktop:{x:30,y:45,zoom:1.1}});
  const original=(await commerce.catalog()).find(p=>p.sku===skus[0])!.content.pdp;
  await admin.save(actor,ids[0]!,{...edited,revision:first.revision});
  assert.deepEqual((await commerce.catalog()).find(p=>p.sku===skus[0])!.content.pdp,original);
  await admin.publish(actor,ids[0]!,{revision:first.revision+1});
  assert.deepEqual((await commerce.catalog()).find(p=>p.sku===skus[0])!.content.pdp,edited.content.pdp);
  const once=(await ctx.db.pool.query('SELECT * FROM product_editor ORDER BY product_id')).rows;
  await ctx.db.pool.query(sql);assert.deepEqual((await ctx.db.pool.query('SELECT * FROM product_editor ORDER BY product_id')).rows,once);
 }finally{await ctx.stop();}
});
