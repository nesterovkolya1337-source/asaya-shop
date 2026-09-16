import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {sitePageDefaults} from '../src/site-content-defaults.js';
import {parseSitePage,sitePublicationIssues,sitePages} from '../src/site-content-format.js';

// Hashes of newline-joined original DOCX paragraphs, independently extracted on 2026-09-13.
const sources={privacy:'928fa1152ac9e89e86de5a8100f23192c1266396048a73807664f455ce40aa5f',offer:'56e46b185d327682195430a70dd1f98deca3ccf00279d9af5a6036e05a8a8b32','personal-data':'4d69aedcab8d21a796f3cf99e626c2f00e229b3a7a7112d927d275f9de3e4166'};
test('final legal documents retain every original paragraph, list item and table cell in order',()=>{
 for(const id of Object.keys(sources) as Array<keyof typeof sources>){
  const page=parseSitePage(sitePageDefaults[id]);assert.deepEqual(sitePublicationIssues(page),[]);
  const paragraphs:string[]=[];
  for(const b of page.blocks){
   if(b.type==='heading'){paragraphs.push(b.values.title!,...b.values.text!.split('\n\n'));}
   else if(b.type==='documentSections')for(const item of b.items){paragraphs.push(item.title!,...item.text!.split('\n\n').filter(Boolean).map(p=>p.startsWith('• ')?p.slice(2):p));}
   else if(b.type==='documentTable')for(const row of b.items)paragraphs.push(...row.title!.split('\n\n'),...row.text!.split('\n\n'));
   else assert.fail('Unexpected legal block');
  }
  assert.equal(createHash('sha256').update(paragraphs.join('\n')).digest('hex'),sources[id],id);
 }
});

test('v3 defaults remove obsolete navigation and use the approved delivery threshold',()=>{
 assert.ok(!sitePages.some(p=>(p.id as string)==='cookies'));
 for(const page of Object.values(sitePageDefaults)){
  assert.deepEqual(sitePublicationIssues(parseSitePage(page)),[]);
  for(const b of page.blocks)for(const v of [b.values,...b.items]){
   assert.ok(!/\/legal\/cookies|\/order-status/.test(v.href??''));
   assert.ok(!/1\s?500\s?₽/.test(v.text??''));
  }
 }
 const menu=sitePageDefaults.header.blocks.find(b=>b.type==='siteMenu')!;
 assert.ok(!menu.items.some(i=>i.href==='/favorites'));
 assert.match(sitePageDefaults.header.blocks.find(b=>b.type==='siteAnnouncement')!.values.text!,/1 000/);
 assert.equal(sitePageDefaults.faq.blocks.find(b=>b.type==='questions')!.items.length,11);
});
