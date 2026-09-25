import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ingredientSegments} from '../src/lib/rich-desktop-presentation.ts';

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
