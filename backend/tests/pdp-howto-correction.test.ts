import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync,statSync} from 'node:fs';
import {correctHowTo} from '../src/pdp-howto-correction.js';
import {parsePdpContent} from '../src/pdp-content.js';
const patches:import('../src/pdp-howto-correction.js').HowToCorrection[]=JSON.parse(readFileSync(new URL('../../data/pdp-howto-corrections-20260925.json',import.meta.url),'utf8'));
for(const patch of patches)test('verified existing how-to correction '+patch.sku,()=>{
 const other:import('../src/pdp-content.js').PdpSection={kind:'result',title:'Manager title',body:'Original',additionalBody:'',media:[],items:[]};
 const pdp:import('../src/pdp-content.js').PdpContent={version:1,node:'440:2890',enabled:true,sections:[other,{...patch.expected,visible:false}],recommendations:[]};
 const result=correctHowTo(pdp,patch);assert.equal(result.status,'ready');assert.equal(result.content!.sections[1]!.visible,false);assert.deepEqual(result.content!.sections[0],other);
 assert.equal(correctHowTo(result.content,patch).status,'already_corrected');
 assert.equal(correctHowTo({...pdp,enabled:false},patch).status,'not_published_content');
 assert.equal(correctHowTo({...pdp,sections:[other]},patch).status,'missing_section');
 assert.equal(correctHowTo({...pdp,sections:[other,{...patch.expected,body:'Manager edit'}]},patch).status,'content_conflict');
 assert.doesNotThrow(()=>parsePdpContent(result.content));
 for(const item of patch.replacement.items)if(item.media)assert.ok(statSync(new URL('../../../public'+item.media.src,import.meta.url)).size>0,'Figma source must not be an empty download');
});
