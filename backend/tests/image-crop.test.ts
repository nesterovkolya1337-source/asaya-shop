import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseImageCrop,defaultImageCrop} from '../src/image-crop.js';
import {parseSitePage} from '../src/site-content-format.js';
import {sitePageDefaults} from '../src/site-content-defaults.js';
const crop={desktop:{x:24,y:60,zoom:1.3},mobile:{x:72,y:15,zoom:2}};
test('crop metadata validates finite bounded coordinates and keeps independent device framing',()=>{
 assert.deepEqual(parseImageCrop(JSON.stringify(crop)),crop);
 assert.equal(parseImageCrop(''),null);
 for(const value of ['{}','null','[]','bad',JSON.stringify({...crop,source:'data:image'}),JSON.stringify({desktop:{x:50,y:50,zoom:.5}}),JSON.stringify({desktop:{x:-1,y:50,zoom:1}}),JSON.stringify({desktop:{x:50,y:101,zoom:1}}),JSON.stringify({desktop:{x:50,y:50,zoom:6}}),JSON.stringify({desktop:{x:'50',y:50,zoom:1}}),JSON.stringify({desktop:{x:50,y:50,zoom:1,unexpected:1}}),JSON.stringify({desktop:crop.desktop,mobile:null})])assert.throws(()=>parseImageCrop(value),/INVALID_SITE_CONTENT/);
});
test('only image fields can carry crop metadata; legacy documents and original image URLs survive',()=>{
 const page=structuredClone(sitePageDefaults.home),source=page.blocks[0]!.values.image;
 assert.deepEqual(parseSitePage(page),page);
 page.blocks[0]!.values.imageCrop=JSON.stringify(crop);
 const gallery=page.blocks.find(b=>b.type==='gallery')!;gallery.items[0]!.imageCrop=JSON.stringify(crop);
 const parsed=parseSitePage(page);
 assert.equal(parsed.blocks[0]!.values.image,source);
 assert.deepEqual(JSON.parse(parsed.blocks[0]!.values.imageCrop!),crop);
 assert.equal(parsed.blocks.find(b=>b.type==='gallery')!.items[0]!.imageCrop,JSON.stringify(crop));
 page.blocks[0]!.values.titleCrop=JSON.stringify(crop);assert.throws(()=>parseSitePage(page),/INVALID_SITE_CONTENT/);
});
test('Figma crop defaults remain bounded for all supplied originals',()=>{
 for(const page of Object.values(sitePageDefaults))for(const block of page.blocks)for(const values of [block.values,...block.items])if(values.image)assert.ok(parseImageCrop(JSON.stringify(defaultImageCrop(block.type,values.image))));
});
