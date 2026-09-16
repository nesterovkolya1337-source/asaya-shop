import {after,before,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {sitePageDefaults} from '../src/site-content-defaults.js';
import {planLegalPublication,applyLegalPublication,legalReleasePage} from '../src/legal-publication.js';
import {testDatabase} from './postgres.js';
import {SiteContent} from '../src/site-content.js';

test('legal text is identical to every paragraph and table cell in v10.1 Appendices A-C',async()=>{
 const expected=JSON.parse(await readFile('tests/fixtures/legal-v10.1.json','utf8'));
 for(const id of ['offer','privacy','personal-data'] as const){
  const actual:string[]=[];
  for(const b of sitePageDefaults[id].blocks){
   assert.equal(b.visible,true);
   if(b.type==='heading')actual.push(b.values.title!,...b.values.text!.split('\n\n'));
   else if(b.type==='documentSections')for(const i of b.items)actual.push(i.title!,...i.text!.split('\n\n').filter(Boolean).map(p=>p.replace(/^• /,'')));
   else if(b.type==='documentTable')for(const i of b.items)actual.push(...i.title!.split('\n\n'),...i.text!.split('\n\n'));
   else assert.fail('Unverified legal block');
  }
  assert.deepEqual(actual,expected[id],id);
 }
});

test('legal release preserves custom header geometry and promotion while correcting cookie links',()=>{
 const header=structuredClone(sitePageDefaults.header);
 const promotion=header.blocks.find(b=>b.type==='siteAnnouncement')!;
 promotion.values.text='Своя акция';
 const menu=header.blocks.find(b=>b.type==='siteMenu')!;
 menu.items.push({title:'Cookies',href:'/legal/cookies/'},{title:'Телефон',href:'tel:+70000000000'});
 const fixed=legalReleasePage('header',header);
 assert.equal(fixed.blocks.find(b=>b.type==='siteAnnouncement')!.values.text,'Своя акция');
 assert.ok(!JSON.stringify(fixed).includes('tel:'));
 assert.ok(!JSON.stringify(fixed).includes('/legal/cookies'));
 assert.deepEqual(fixed.blocks.find(b=>b.type==='siteBrand'),header.blocks.find(b=>b.type==='siteBrand'));
});

let ctx:Awaited<ReturnType<typeof testDatabase>>;
before(async()=>{ctx=await testDatabase();});
after(async()=>{await ctx?.stop();});
test('explicit publication replaces stale public legal pages atomically, preserves drafts and rejects stale or unauthorised plans',async()=>{
 const actor=randomUUID(),customer=randomUUID();
 await ctx.db.pool.query("INSERT INTO users(id,role) VALUES($1,'admin'),($2,'customer')",[actor,customer]);
 const content=new SiteContent(ctx.db),old=structuredClone(sitePageDefaults.offer);
 old.blocks[0]!.values.text='Старая редакция';
 await content.save(actor,'offer',{revision:0,page:old});await content.publish(actor,'offer',{revision:1});
 old.blocks[0]!.values.text='Незавершённый черновик';await content.save(actor,'offer',{revision:2,page:old});
 const plan=await planLegalPublication(ctx.db);
 assert.equal((await content.publicPage('offer')).page!.blocks[0]!.values.text,'Старая редакция');
 await assert.rejects(applyLegalPublication(ctx.db,customer,plan),/FORBIDDEN/);
 const tampered=structuredClone(plan);tampered.pages[0]!.after.blocks[0]!.values.text='Другой текст';
 await assert.rejects(applyLegalPublication(ctx.db,actor,tampered),/INVALID_LEGAL_PLAN/);
 // A later page changes after review: earlier pages must remain untouched.
 await content.save(actor,'footer',{revision:0,page:sitePageDefaults.footer});
 await assert.rejects(applyLegalPublication(ctx.db,actor,plan),/LEGAL_PLAN_STALE/);
 assert.equal((await content.publicPage('offer')).page!.blocks[0]!.values.text,'Старая редакция');
 const fresh=await planLegalPublication(ctx.db);
 assert.equal((await applyLegalPublication(ctx.db,actor,fresh)).published,9);
 assert.deepEqual((await content.publicPage('offer')).page,legalReleasePage('offer'));
 assert.equal((await content.get('offer')).draft.blocks[0]!.values.text,'Незавершённый черновик');
 assert.equal((await ctx.db.pool.query("SELECT count(*)::int AS n FROM audit_log WHERE action='site.legal_v10_1_published'")).rows[0].n,9);
 await assert.rejects(applyLegalPublication(ctx.db,actor,fresh),/LEGAL_PLAN_STALE/);
});
