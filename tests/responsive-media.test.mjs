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
