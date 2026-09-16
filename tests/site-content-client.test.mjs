import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSiteClient,parseSiteDraft,sitePageDefaults,parseSitePage,sitePublicationIssues} from '../src/lib/site-content-client.ts';
import {sitePages,allowedBlockTypes} from '../backend/src/site-content-format.ts';
const page=()=>parseSitePage(structuredClone(sitePageDefaults.home)),csrf='a'.repeat(64);
test('editor contract protects unsafe links and all original pages can be published',()=>{
 for(const p of Object.values(sitePageDefaults))assert.deepEqual(sitePublicationIssues(parseSitePage(p)),[]);
 const p=page();p.blocks[0].values.href='javascript:alert(1)';assert.throws(()=>parseSitePage(p));
 assert.throws(()=>parseSiteDraft({id:'home',revision:2,draft:sitePageDefaults.about,publishedAt:null}));
 assert.throws(()=>parseSiteDraft({id:'home',revision:-1,draft:page(),publishedAt:null}));
});

test('shared content stays in its own document and keeps a usable brand and menu',()=>{
 assert.equal(sitePages.length,14);
 assert.ok(!sitePages.some(page=>page.id==='cookies'));
 assert.deepEqual(Object.keys(sitePageDefaults).sort(),sitePages.map(p=>p.id).sort());
 const header=()=>parseSitePage(structuredClone(sitePageDefaults.header));
 const h=header(),brand=h.blocks.find(b=>b.type==='siteBrand'),menu=h.blocks.find(b=>b.type==='siteMenu');
 brand.visible=false;menu.visible=false;assert.equal(sitePublicationIssues(h).length,2);
 // Hidden optional sections are removed by the public endpoint and must still parse.
 const publicHeader=header();publicHeader.blocks=publicHeader.blocks.filter(b=>b.type==='siteBrand'||b.type==='siteMenu');
 assert.deepEqual(sitePublicationIssues(parseSitePage(publicHeader)),[]);
 const duplicate=header();duplicate.blocks.push({...structuredClone(duplicate.blocks[0]),id:'duplicate'});assert.throws(()=>parseSitePage(duplicate));
 const misplaced=page();misplaced.blocks.push(structuredClone(brand));assert.throws(()=>parseSitePage(misplaced));
 const wrongHeader=header();wrongHeader.blocks.push({...structuredClone(page().blocks[0]),id:'misplaced'});assert.throws(()=>parseSitePage(wrongHeader));
 const oversized=header(),navigation=oversized.blocks.find(b=>b.type==='siteNavigation');navigation.items=Array.from({length:4},()=>({title:'Страница',href:'/about/'}));assert.throws(()=>parseSitePage(oversized));
 const footer=parseSitePage(structuredClone(sitePageDefaults.footer));
 footer.blocks.push({...structuredClone(footer.blocks.find(b=>b.type==='footerLinks')),id:'additional-links'});
 assert.deepEqual(sitePublicationIssues(parseSitePage(footer)),[]);
 assert.ok(!allowedBlockTypes('privacy').includes('siteLegal'));
 assert.ok(allowedBlockTypes('privacy').includes('documentSections'));
});

test('editable contacts reject executable links while documents remain plain text',()=>{
 const footer=()=>parseSitePage(structuredClone(sitePageDefaults.footer));
 for(const href of ['javascript:alert(1)','data:text/html,test','//evil.test','https://user:pass@example.test']){
  const f=footer();f.blocks.find(b=>b.type==='siteHelp').items[0].href=href;assert.throws(()=>parseSitePage(f));
 }
 const f=footer();f.blocks.find(b=>b.type==='siteHelp').items=[{title:'Почта',href:'mailto:hello@asaya.ru'},{title:'Телефон',href:'tel:+74951234567'}];
 assert.deepEqual(sitePublicationIssues(parseSitePage(f)),[]);
 const p=parseSitePage(structuredClone(sitePageDefaults.privacy));
 p.blocks.find(b=>b.type==='documentSections').items[0].text='<script>literal text</script>\nНовая строка';
 assert.equal(parseSitePage(p).blocks.find(b=>b.type==='documentSections').items[0].text,'<script>literal text</script>\nНовая строка');
 assert.throws(()=>parseSitePage({...p,html:'<script>alert(1)</script>'}));
});
test('site editing sends revision and CSRF and retains conflict as an error',async()=>{
 const calls=[],api=createSiteClient('/api/admin/v1',async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify({id:'home',revision:3}));});
 await api.save('home',page(),2,csrf);assert.equal(calls[0].options.headers['X-CSRF-Token'],csrf);assert.equal(JSON.parse(calls[0].options.body).revision,2);assert.equal(calls[0].options.credentials,'same-origin');
 await assert.rejects(createSiteClient('/api',async()=>new Response(JSON.stringify({error:'EDIT_CONFLICT'}),{status:409})).save('home',page(),2,csrf),e=>e.code==='EDIT_CONFLICT');
 await assert.rejects(createSiteClient('/api',async()=>new Response(JSON.stringify({id:'about',revision:3}))).publish('home',2,csrf),e=>e.code==='INVALID_RESPONSE');
});
