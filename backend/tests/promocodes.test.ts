import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {testDatabase} from './postgres.js';
import {Promocodes,applyPromo,allocatePromo,validatePromo,promoSettings,normalizePromo,type PromoSettings} from '../src/promocodes.js';
import {cartPricing,priceCart} from '../src/cart-pricing.js';
import {AdminCatalog,emptyContent} from '../src/admin-catalog.js';
import {YandexFeed} from '../src/yandex-feed.js';
const settings:PromoSettings={kind:'percent',value:10,active:true,startsAt:null,endsAt:null,minimumMinor:0,usageLimit:null};
test('promo allocation follows quantity discount and preserves exact nonnegative kopeck totals',()=>{
 const quantity=priceCart([{sku:'A',quantity:2,finalMinor:79900,eligible:true}],{twoPercent:10,threePercent:15,freeShippingMinor:100000});
 assert.equal(quantity.items[0]!.unitMinor,71900);
 const percent=allocatePromo(quantity.items,settings);assert.equal(percent.subtotalMinor,129420);assert.equal(percent.discountMinor,14380);
 const lines=[{sku:'B',quantity:2,unitMinor:100},{sku:'A',quantity:1,unitMinor:100}];
 const fixed=allocatePromo(lines,{...settings,kind:'fixed',value:101});assert.equal(fixed.subtotalMinor,199);assert.equal(fixed.allocations.reduce((n,i)=>n+i.lineMinor,0),199);
 assert.deepEqual(allocatePromo([...lines].reverse(),{...settings,kind:'fixed',value:101}).allocations.reverse(),fixed.allocations);
 assert.equal(allocatePromo(lines,{...settings,kind:'fixed',value:100000}).subtotalMinor,0);
 assert.equal(normalizePromo(' sa ve 10 '),'SAVE10');
 assert.throws(()=>promoSettings.parse({...settings,value:101}));
 assert.throws(()=>promoSettings.parse({...settings,startsAt:'2026-10-01T00:00:00Z',endsAt:'2026-09-01T00:00:00Z'}));
});
test('promo dates, minimum and usage are checked on every quote',()=>{
 const now=new Date('2026-09-24T10:00:00Z');
 for(const [patch,code] of [[{active:false},'INACTIVE'],[{startsAt:'2026-10-01T00:00:00Z'},'NOT_STARTED'],[{endsAt:now.toISOString()},'EXPIRED'],[{minimumMinor:1001},'MINIMUM'],[{usageLimit:1},'LIMIT']] as const)assert.throws(()=>validatePromo({...settings,...patch},1000,1,now),new RegExp(code));
 validatePromo({...settings,minimumMinor:1000,usageLimit:2},1000,1,now);
});
let ctx:Awaited<ReturnType<typeof testDatabase>>;
before(async()=>{ctx=await testDatabase();});after(async()=>ctx?.stop());
test('canonical cart recalculates promo, audits management, preserves prices and gates checkout',async()=>{
 const actor=randomUUID(),id=randomUUID(),product=randomUUID(),admin=new Promocodes(ctx.db),catalog=new AdminCatalog(ctx.db);
 await ctx.db.pool.query("INSERT INTO users(id,role) VALUES($1,'admin')",[actor]);
 await admin.save(actor,id,{revision:0,code:' save 10 ',settings:{...settings,minimumMinor:100000}});
 assert.equal((await admin.list()).items[0].code,'SAVE10');
 await assert.rejects(admin.save(actor,id,{revision:0,code:'SAVE10',settings}),/EDIT_CONFLICT/);
 await catalog.save(actor,product,{revision:0,sku:'PROMO-A',slug:'promo-a',name:'Promo product',regularMinor:79900,finalMinor:79900,weightG:null,widthMm:null,heightMm:null,depthMm:null,content:{...emptyContent,description:'Description',ingredients:'Ingredients',image:'/images/test.webp'}});
 await catalog.publish(actor,product,{revision:1});
 await ctx.db.pool.query(`UPDATE marketing_settings SET live=jsonb_set(live,'{twoPercent}','10')`);
 const body={items:[{sku:'PROMO-A',quantity:2}],promoCode:'save10'};
 const quote=await cartPricing(ctx.db.pool,body);assert.equal(quote.subtotalMinor,129420);assert.equal(quote.promo!.checkoutAvailable,false);
 await assert.rejects(cartPricing(ctx.db.pool,{...body,items:[{sku:'PROMO-A',quantity:1}]}),/PROMO_MINIMUM/);
 assert.equal(Number((await ctx.db.pool.query('SELECT final_minor FROM product_prices WHERE product_id=$1',[product])).rows[0].final_minor),79900);
 await admin.save(actor,id,{revision:1,code:'SAVE10',settings:{...settings,active:false}});
 await assert.rejects(applyPromo(ctx.db.pool,'save10',quote.items),/PROMO_INACTIVE/);
 assert.equal((await ctx.db.pool.query("SELECT count(*)::int n FROM audit_log WHERE entity_id=$1 AND actor_id=$2 AND action LIKE 'promo.%'",[id,actor])).rows[0].n,2);
 const feed=new YandexFeed(ctx.db,{accountId:'test',environment:'test',publicOrigin:'https://example.test',warehouses:[]});
 await assert.rejects(feed.checkoutLink(body),/PROMO_CHECKOUT_UNAVAILABLE/);
 assert.equal((await ctx.db.pool.query('SELECT count(*)::int n FROM promocode_usages')).rows[0].n,0);
});


test('public cart cannot apply promos while local opt-in preview can expose the UI',async()=>{
 const {buildApp}=await import('../src/app.js');const {DisabledOtpSender}=await import('../src/auth.js');
 for(const [origin,preview,enabled] of [['https://asaya.ru',true,false],['http://127.0.0.1:3393',false,false],['http://127.0.0.1:3393',true,true]] as const){
  const app=await buildApp({db:ctx.db,origin,secureCookies:origin.startsWith('https:'),otpSecret:'isolated-test-secret-12345678901234567890',otpSender:new DisabledOtpSender(),promoLocalPreview:preview});
  try{
   const normal=await app.inject({method:'POST',url:'/api/store/v1/cart/pricing',headers:{origin},payload:{items:[]}});
   assert.equal(normal.statusCode,200);assert.equal(normal.json().promoApplicationEnabled,enabled);assert.equal(normal.json().promo,null);
   const promo=await app.inject({method:'POST',url:'/api/store/v1/cart/pricing',headers:{origin},payload:{items:[],promoCode:'UNKNOWN'}});
   assert.equal(promo.json().error,enabled?'PROMO_NOT_FOUND':'PROMO_APPLICATION_DISABLED');
  }finally{await app.close();}
 }
});

