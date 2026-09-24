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

test('Rich Content is explicit opt-in and preserves disabled data without changing canonical fields',()=>{
 const rich={...pdp,node:'418:2286',enabled:true};
 assert.equal(parsePdpContent(rich).enabled,true);
 assert.deepEqual(parsePdpContent({...rich,enabled:false}).sections,pdp.sections);
 assert.equal(parsePdpContent(pdp).enabled,undefined);
 assert.throws(()=>parsePdpContent({...rich,enabled:'true'}));
 const c=contentSchema.parse({...emptyContent,description:'Canonical description',ingredients:'Canonical ingredients',pdp:rich});
 assert.equal(c.description,'Canonical description');assert.equal(c.ingredients,'Canonical ingredients');
});

test('block visibility is optional for legacy data and preserves hidden content and asset ownership',()=>{
 const hidden={...pdp,enabled:true,sections:[{...section,visible:false}]};
 assert.deepEqual(parsePdpContent(hidden),hidden);
 assert.deepEqual(pdpMediaSources(parsePdpContent(hidden)),pdpMediaSources(parsePdpContent(pdp)));
 assert.deepEqual(parsePdpContent({...hidden,enabled:false}).sections,hidden.sections);
 assert.throws(()=>parsePdpContent({...hidden,sections:[{...section,visible:'false'}]}));
});
