import {test} from 'node:test';
import assert from 'node:assert/strict';
import {responsiveMedia} from '../src/lib/responsive-media.ts';
const src='/manage/api/store/v1/media/00000000-0000-4000-8000-000000000001';
test('responsive managed media uses six derivative widths and preserves layout sizes and crop metadata',()=>{
 const crop=JSON.stringify({desktop:{x:20,y:70,zoom:2},mobile:{x:50,y:40,zoom:1}});
 const image=responsiveMedia(src,'370px',crop);assert.equal(image.sizes,'370px');
 assert.equal(image.srcSet.split(', ').length,6);assert.match(image.srcSet,/w=3200/);assert.match(image.src,/w=640/);
 assert.deepEqual(JSON.parse(new URL(image.src,'http://localhost').searchParams.get('crop')),JSON.parse(crop));
 assert.notEqual(responsiveMedia(src,'370px').src,image.src);
 assert.equal(responsiveMedia('/images/legacy.webp','370px'),null);
 assert.equal(responsiveMedia('https://other.test/image.jpg','370px'),null);
});

import variants from '../src/lib/rich-image-variants.json' with {type:'json'};
import {existsSync} from 'node:fs';
test('only known Figma masters use existing bounded WebP variants; originals and managed crops remain intact',()=>{
 for(const [source,images] of Object.entries(variants)){
  const result=responsiveMedia(source,'320px');assert.equal(result.sizes,'320px');assert.ok(result.src.endsWith('.webp'));
  assert.ok(images.every(v=>v.width<=1920&&existsSync('public'+v.src)));
  assert.ok(responsiveMedia('/manage'+source,'320px').src.startsWith('/manage/images/'));
 }
 assert.equal(responsiveMedia('/images/figma/rich-content/unknown.png','320px'),null);
});
