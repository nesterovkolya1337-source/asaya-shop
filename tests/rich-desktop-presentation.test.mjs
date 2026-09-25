import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ingredientSegments} from '../src/lib/rich-desktop-presentation.ts';
import {desktopSection} from '../src/lib/rich-desktop-presentation.ts';
import approved from '../src/lib/figma-desktop-copy.json' with {type:'json'};

test('approved desktop copy removes legacy additions without mutating mobile data or later Admin edits',()=>{
 for(const [sku,patch] of Object.entries(approved)){
  const source={kind:'ingredients',body:patch.expectedBody,title:'Legacy',additionalBody:'Extra',items:[],visible:false};
  const out=desktopSection(source,sku);
  assert.deepEqual(out.items,patch.items);assert.equal(out.body,'');assert.equal(out.additionalBody,'');assert.equal(out.visible,false);
  assert.equal(source.body,patch.expectedBody);
  const edited={...source,body:'New explicit Admin copy'};assert.equal(desktopSection(edited,sku),edited);
 }
});

const section={kind:'ingredients',title:'Ниацинамид, пептиды и витамин E',body:'Ниацинамид улучшает тон, пептиды поддерживают упругость, а витамин E — защита',additionalBody:'Дополнительный подтверждённый факт.',items:[]};
test('desktop segmentation retains existing component claims and does not mutate canonical copy',()=>{
 const original=structuredClone(section);
 assert.deepEqual(ingredientSegments(Object.freeze(section)),[
  {title:'Ниацинамид',body:'улучшает тон'},
  {title:'пептиды',body:'поддерживают упругость'},
  {title:'витамин E',body:'— защита'},
 ]);
 assert.deepEqual(section,original);
});
test('ambiguous prose and structured components retain their existing renderer',()=>{
 assert.equal(ingredientSegments({...section,body:'Неоднозначное описание компонентов.'}),null);
 assert.equal(ingredientSegments({...section,items:[{title:'A',body:'B'}]}),null);
 assert.equal(ingredientSegments({...section,kind:'result'}),null);
});
