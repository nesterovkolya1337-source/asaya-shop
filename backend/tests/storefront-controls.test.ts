import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {testDatabase} from './postgres.js';
import {StorefrontControls} from '../src/storefront-controls.js';
import {AdminCatalog,emptyContent,contentSchema} from '../src/admin-catalog.js';
import {CommerceService} from '../src/commerce.js';
import {buildApp} from '../src/app.js';
import {DisabledOtpSender} from '../src/auth.js';
let ctx:Awaited<ReturnType<typeof testDatabase>>;
before(async()=>{ctx=await testDatabase();});after(async()=>ctx?.stop());
test('banner defaults off, requires admin, validates links, uses revisions and toggles independently',async()=>{
 const c=new StorefrontControls(ctx.db),admin=randomUUID(),buyer=randomUUID();await ctx.db.pool.query("INSERT INTO users(id,role) VALUES($1,'admin'),($2,'customer')",[admin,buyer]);
 assert.equal((await c.banner()).enabled,false);
 const value={enabled:true,message:'Сообщение',buttonText:'Каталог',buttonUrl:'/catalog/',revision:0};
 await assert.rejects(c.saveBanner(buyer,value),/FORBIDDEN/);await assert.rejects(c.saveBanner(admin,{...value,buttonUrl:'javascript:alert(1)'}));
 await c.saveBanner(admin,value);assert.equal((await c.banner()).message,'Сообщение');await assert.rejects(c.saveBanner(admin,value),/EDIT_CONFLICT/);
 await c.saveBanner(admin,{...value,enabled:false,revision:1});assert.equal((await c.banner()).enabled,false);
 const app=await buildApp({db:ctx.db,otpSecret:'controls-secret-at-least-32-characters',staffSecret:'controls-staff-secret-at-least-32-characters',otpSender:new DisabledOtpSender(),origin:'http://localhost:3200',secureCookies:false});
 try{assert.equal((await app.inject('/api/store/v1/banner')).json().enabled,false);assert.equal((await app.inject('/api/admin/v1/banner')).statusCode,401);assert.equal((await app.inject({method:'PUT',url:'/api/admin/v1/banner',payload:value,headers:{origin:'http://localhost:3200'}})).statusCode,401);}finally{await app.close();}
});
test('existing image crop survives save/reopen/re-crop without changing source, price or lifecycle; stock stays separate',async()=>{
 const actor=randomUUID(),id=randomUUID(),admin=new AdminCatalog(ctx.db),c=new StorefrontControls(ctx.db,false);await ctx.db.pool.query("INSERT INTO users(id,role) VALUES($1,'admin')",[actor]);
 const draft={revision:0,sku:'CROP-OLD',name:'Old photo',slug:'old-photo',regularMinor:50000,finalMinor:50000,weightG:null,widthMm:null,heightMm:null,depthMm:null,content:{...emptyContent,description:'Description',ingredients:'Ingredients',image:'/images/old.webp',gallery:['/images/old-gallery.webp']}};
 await admin.save(actor,id,draft);await admin.publish(actor,id,{revision:1});
 const crop=JSON.stringify({desktop:{x:15,y:70,zoom:2}});let current=await admin.detail(id);
 await admin.save(actor,id,{...current.draft,revision:current.revision,content:{...current.draft.content,imageCrops:{'/images/old.webp':crop}}});
 current=await admin.detail(id);assert.equal(current.lifecycle,'published');assert.equal(current.draft.content.image,'/images/old.webp');assert.equal(current.draft.content.imageCrops['/images/old.webp'],crop);
 const crop2=JSON.stringify({desktop:{x:70,y:40,zoom:1.4}});await admin.save(actor,id,{...current.draft,revision:current.revision,content:{...current.draft.content,imageCrops:{'/images/old.webp':crop2}}});
 assert.equal(contentSchema.safeParse({...draft.content,imageCrops:{'/images/old.webp':'{"desktop":{"x":200,"y":0,"zoom":1}}'}}).success,false);
 const commerce=new CommerceService(ctx.db),before=await admin.detail(id);assert.equal((await c.stock(id)).enabled,false);assert.equal((await commerce.catalog(true)).find(p=>p.sku==='CROP-OLD')!.available,0);
 await c.saveStock(actor,id,{enabled:true,quantity:5,revision:0});assert.equal((await c.stock(id)).real,0);assert.equal((await commerce.catalog(true)).find(p=>p.sku==='CROP-OLD')!.available,0);assert.equal((await commerce.catalog()).find(p=>p.sku==='CROP-OLD')!.available,0);
 assert.deepEqual(await admin.detail(id),before);await assert.rejects(c.saveStock(actor,id,{enabled:true,quantity:9,revision:0}),/EDIT_CONFLICT/);
 await c.saveStock(actor,id,{enabled:false,quantity:5,revision:1});assert.equal((await commerce.catalog(true)).find(p=>p.sku==='CROP-OLD')!.available,0);assert.equal((await c.stock(id)).quantity,5);
 assert.equal((await ctx.db.pool.query('SELECT 1 FROM inventory_reservations')).rowCount,0);
});

test('appearance order persists globally, rejects invalid permutations, protects concurrent edits and other settings',async()=>{
 const c=new StorefrontControls(ctx.db),admin=randomUUID(),buyer=randomUUID();await ctx.db.pool.query("INSERT INTO users(id,role) VALUES($1,'admin'),($2,'customer')",[admin,buyer]);
 const before=await c.banner(),sales=await c.sales(),initial=await c.appearance();
 assert.deepEqual(initial.order,['reviews','richContent','recommendations']);
 const v={order:['recommendations','reviews','richContent'],revision:initial.revision};
 await assert.rejects(c.saveAppearance(buyer,v),/FORBIDDEN/);
 for(const order of [['reviews','reviews','richContent'],['product','reviews','richContent'],['reviews']])await assert.rejects(c.saveAppearance(admin,{...v,order}));
 await c.saveAppearance(admin,v);assert.deepEqual((await c.appearance()).order,v.order);
 await assert.rejects(c.saveAppearance(admin,v),/EDIT_CONFLICT/);
 assert.deepEqual(await c.banner(),before);assert.deepEqual(await c.sales(),sales);
 const app=await buildApp({db:ctx.db,otpSecret:'appearance-secret-at-least-32-characters',staffSecret:'appearance-staff-at-least-32-characters',otpSender:new DisabledOtpSender(),origin:'http://localhost:3200',secureCookies:false});
 try{assert.deepEqual((await app.inject('/api/store/v1/appearance')).json(),{order:v.order});assert.equal((await app.inject({method:'PUT',url:'/api/admin/v1/appearance',payload:v,headers:{origin:'http://localhost:3200'}})).statusCode,401);}finally{await app.close();}
 await ctx.db.pool.query("UPDATE storefront_banner SET pdp_order='[]'::jsonb WHERE singleton");assert.deepEqual((await c.appearance()).order,initial.order);
});
