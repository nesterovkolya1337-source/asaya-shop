import {before,after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {testDatabase} from './postgres.js';
import {MediaService,prepareImage,MAX_IMAGE_BYTES} from '../src/media.js';
import {AdminCatalog,emptyContent} from '../src/admin-catalog.js';
import {CommerceService} from '../src/commerce.js';
import {StaffAuth,totp,decodeBase32} from '../src/staff-auth.js';
import {DisabledOtpSender} from '../src/auth.js';
import {buildApp} from '../src/app.js';
let ctx:Awaited<ReturnType<typeof testDatabase>>;
let actor:string;
const png=()=>sharp({create:{width:100,height:60,channels:4,background:{r:50,g:180,b:100,alpha:0.5}}}).png().toBuffer();
before(async()=>{ctx=await testDatabase();});
after(async()=>{await ctx?.stop();});
beforeEach(async()=>{await ctx.db.pool.query('TRUNCATE users,products,storefront_mappings,rate_limits CASCADE');actor=randomUUID();await ctx.db.pool.query("INSERT INTO users(id,role) VALUES($1,'admin')",[actor]);});
test('image processing re-encodes raster, strips EXIF, orients and bounds size while preserving alpha',async()=>{
 const original=await sharp({create:{width:3000,height:1000,channels:3,background:'green'}}).jpeg().withMetadata({orientation:6}).toBuffer();
 const image=await prepareImage(original),meta=await sharp(image.content).metadata();
 assert.equal(meta.format,'webp');assert.equal(image.width,683);assert.equal(image.height,2048);assert.equal(meta.exif,undefined);assert.equal(meta.orientation,undefined);
 const transparent=await prepareImage(await png());assert.equal((await sharp(transparent.content).metadata()).hasAlpha,true);
 const webp=await prepareImage(transparent.content);assert.equal(webp.width,100);
});
test('image decoder rejects oversized, deceptive and corrupt uploads',async()=>{
 await assert.rejects(prepareImage(Buffer.alloc(MAX_IMAGE_BYTES+1)),/IMAGE_TOO_LARGE/);
 await assert.rejects(prepareImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')),/UNSUPPORTED_IMAGE/);
 await assert.rejects(prepareImage(Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(30)])),/INVALID_IMAGE/);
 const huge=await sharp({create:{width:6000,height:5000,channels:3,background:'white'}}).png().toBuffer();
 await assert.rejects(prepareImage(huge),/INVALID_IMAGE/);
});
test('upload retries persist one immutable image and one audit event, including concurrent retries',async()=>{
 const service=new MediaService(ctx.db),id=randomUUID(),data=(await png()).toString('base64');
 const [first,second]=await Promise.all([service.upload(actor,{id,data}),service.upload(actor,{id,data})]);
 assert.deepEqual(first,second);assert.deepEqual(await service.upload(actor,{id,data}),first);
 assert.equal((await ctx.db.pool.query('SELECT * FROM product_media')).rowCount,1);
 assert.equal((await ctx.db.pool.query("SELECT * FROM audit_log WHERE entity_id=$1 AND action='media.uploaded'",[id])).rowCount,1);
 assert.equal((await sharp((await new MediaService(ctx.db).get(id)).content).metadata()).format,'webp');
 const different=await sharp({create:{width:2,height:2,channels:3,background:'blue'}}).png().toBuffer();
 await assert.rejects(service.upload(actor,{id,data:different.toString('base64')}),/MEDIA_CONFLICT/);
 await assert.rejects(service.upload(actor,{id:randomUUID(),data:'!!!!'}),/INVALID_IMAGE/);
 await assert.rejects(service.get(randomUUID()),/MEDIA_NOT_FOUND/);
});
test('uploaded photo references must exist; published replacement is live; removing a reference retains bytes',async()=>{
 const media=new MediaService(ctx.db),catalog=new AdminCatalog(ctx.db),commerce=new CommerceService(ctx.db),id=randomUUID();
 const image=await media.upload(actor,{id:randomUUID(),data:(await png()).toString('base64')});
 const d={revision:0,sku:'PHOTO',name:'Фото',slug:'photo-product',regularMinor:30000,finalMinor:25000,weightG:null,widthMm:null,heightMm:null,depthMm:null,
 content:{...emptyContent,description:'Описание',volume:'300 мл',image:image.url,usage:'Применение',ingredients:'Состав'}};
 await assert.rejects(catalog.save(actor,id,{...d,content:{...d.content,image:'/api/store/v1/media/'+randomUUID()}}),/MEDIA_REFERENCE_MISSING/);
 assert.equal((await ctx.db.pool.query('SELECT * FROM products WHERE id=$1',[id])).rowCount,0);
 await catalog.save(actor,id,d);await catalog.publish(actor,id,{revision:1});
 assert.equal((await commerce.catalog())[0]!.content.image,image.url);
 await catalog.save(actor,id,{...d,revision:2,content:{...d.content,image:'/images/replacement.webp'}});
 assert.equal((await commerce.catalog())[0]!.content.image,'/images/replacement.webp');
 await catalog.publish(actor,id,{revision:3});assert.equal((await commerce.catalog())[0]!.content.image,'/images/replacement.webp');
 assert.ok((await media.get(image.id)).content.length);
});
test('HTTP upload requires staff, origin and CSRF before body parsing; image reads return only normalized raster',async()=>{
 const secret='isolated-media-test-secret-at-least-32-characters',key='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',password='Media-Test-Password-9351',origin='http://127.0.0.1:3200';
 await new StaffAuth(ctx.db,secret).provision('media@example.test',password,key);
 const app=await buildApp({db:ctx.db,otpSecret:secret,staffSecret:secret,otpSender:new DisabledOtpSender(),origin,secureCookies:false});
 try{
  const url='/api/admin/v1/media',data=(await png()).toString('base64'),id=randomUUID(),payload={id,data};
  assert.equal((await app.inject({method:'POST',url,headers:{origin},payload})).statusCode,401);
  const login=await app.inject({method:'POST',url:'/api/admin/v1/auth/login',headers:{origin},payload:{email:'media@example.test',password,code:totp(decodeBase32(key),Math.floor(Date.now()/30000))}});
  assert.equal(login.statusCode,200);const cookie=String(login.headers['set-cookie']).split(';')[0]!,csrf=login.json().csrfToken;
  assert.equal((await app.inject({method:'POST',url,headers:{origin,cookie},payload})).statusCode,403);
  assert.equal((await app.inject({method:'POST',url,headers:{origin:'https://other.test',cookie,'x-csrf-token':csrf},payload})).statusCode,403);
  assert.equal((await app.inject({method:'POST',url,headers:{origin,'content-type':'application/json'},payload:'{'})).statusCode,401);
  const response=await app.inject({method:'POST',url,headers:{origin,cookie,'x-csrf-token':csrf},payload});
  assert.equal(response.statusCode,201);assert.equal(response.json().url,'/api/store/v1/media/'+id);
  const get=await app.inject({url:response.json().url});assert.equal(get.statusCode,200);
  assert.equal(get.headers['content-type'],'image/webp');assert.equal(get.headers['x-content-type-options'],'nosniff');assert.match(String(get.headers['cache-control']),/immutable/);
  assert.equal((await sharp(get.rawPayload).metadata()).format,'webp');
  assert.equal((await app.inject({url:'/api/store/v1/media/'+randomUUID()})).statusCode,404);
  assert.equal((await app.inject({url:'/api/store/v1/media/invalid'})).statusCode,400);
 }finally{await app.close();}
});
