import {before,after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {testDatabase} from './postgres.js';
import {Warehouses,ensureOnboardingWarehouses,onboardingWarehouses,ycpWarehouses} from '../src/warehouses.js';
import {YcpCatalog,type YcpSettings} from '../src/ycp-catalog.js';
import {YcpCheckout} from '../src/ycp-checkout.js';
import {buildApp} from '../src/app.js';
import {DisabledOtpSender} from '../src/auth.js';
import {hash} from '../src/core.js';
import {StaffAuth} from '../src/staff-auth.js';

let ctx:Awaited<ReturnType<typeof testDatabase>>;
const token='warehouse-test-inbound-secret-32-characters';
const staffSecret='warehouse-test-staff-secret-distinct-from-token';
const settings:YcpSettings={accountId:'asaya-test',environment:'test',publicOrigin:'https://asaya.example.test',priceUnit:'minor',vat:0,warehouseSource:'database',warehouses:[],checkout:{deliveryPriceUnit:'minor'}};
before(async()=>{ctx=await testDatabase();});after(async()=>{await ctx?.stop();});
beforeEach(async()=>{await ctx.db.pool.query('TRUNCATE products,warehouses,users,integration_inbox,integration_outbox CASCADE');});
async function fixture(){
 await ctx.db.pool.query("UPDATE storefront_banner SET sales_enabled=false");
 await ensureOnboardingWarehouses(ctx.db);const actor=randomUUID(),product=randomUUID();
 await ctx.db.pool.query("INSERT INTO users(id,role) VALUES($1,'admin')",[actor]);
 await ctx.db.pool.query("INSERT INTO products(id,sku,name,active,sale_approved,weight_g,width_mm,height_mm,depth_mm) VALUES($1,'TEST-GEL','Тестовый гель',true,true,500,60,190,40)",[product]);
 await ctx.db.pool.query("INSERT INTO product_prices(product_id,currency,regular_minor,final_minor,approved) VALUES($1,'RUB',60000,50000,true)",[product]);
 await ctx.db.pool.query("INSERT INTO storefront_mappings(slug,product_id,confidence,approved,reason) VALUES('test-gel',$1,'high',true,'test')",[product]);
 const registry=new Warehouses(ctx.db),warehouse=(await registry.list()).items.find(w=>w.id===onboardingWarehouses[0].id)!;
 const {id,code,bindings,...edit}=warehouse;
 return {actor,product,id,registry,edit,catalog:new YcpCatalog(ctx.db,token,settings)};
}

test('warehouse onboarding creates stable CDEK bindings without inventing stock and preserves later edits on replay',async()=>{
 const f=await fixture();
 const listed=await f.registry.list();assert.equal(listed.items.length,1);
 assert.ok(listed.items.every(w=>!w.canFulfill&&w.address===onboardingWarehouses[0].address&&w.phone===onboardingWarehouses[0].phone&&w.bindings[0].syncStatus==='pending'&&w.bindings[0].lastStockSyncAt===null));
 assert.equal((await ctx.db.pool.query('SELECT count(*)::int n FROM inventory_balances')).rows[0].n,0);
 await f.registry.save(f.actor,f.id,{...f.edit,name:'Название Максима',address:'Подтверждённый тестовый адрес',phone:'+79990000000'});
 await ctx.db.pool.query('INSERT INTO inventory_balances(product_id,warehouse_id,on_hand,reserved) VALUES($1,$2,10,3)',[f.product,f.id]);
 assert.ok((await ensureOnboardingWarehouses(ctx.db)).items.every(w=>!w.created));
 assert.equal((await f.registry.list()).items.find(w=>w.id===f.id)!.name,'Название Максима');
 assert.deepEqual((await ctx.db.pool.query('SELECT on_hand,reserved FROM inventory_balances')).rows,[{on_hand:10,reserved:3}]);
});

test('database YCP warehouse export has all required fields, stable pagination and no provider identifiers or stock counts',async()=>{
 const f=await fixture(),all=await f.catalog.warehouses({limit:100,offset:0});
 assert.equal(all.total_count,1);
 for(const w of all.warehouses){
  for(const field of ['id','title','address','phone'] as const)assert.equal(typeof w[field],'string');
  assert.equal(w.address,onboardingWarehouses[0].address);assert.equal(w.phone,onboardingWarehouses[0].phone);
  assert.deepEqual(w.self_pickup_options,{enabled:false});assert.deepEqual(w.ycp_delivery_options,{enabled:false});
  assert.ok(!JSON.stringify(w).includes('23401'));assert.ok(!('onHand' in w));
 }
 assert.deepEqual((await f.catalog.warehouses({limit:1,offset:0})).warehouses.concat((await f.catalog.warehouses({limit:1,offset:1})).warehouses),all.warehouses);
 assert.deepEqual(await f.catalog.warehouses({limit:1,offset:2}),{warehouses:[],total_count:1});
 await f.registry.save(f.actor,f.id,{...f.edit,ycpExportEnabled:false});
 assert.equal((await f.catalog.warehouses({limit:10,offset:0})).total_count,0);
 const legacy=new YcpCatalog(ctx.db,token,{...settings,warehouseSource:'configuration'});
 assert.equal((await legacy.warehouses({limit:10,offset:0})).total_count,0);
});

test('sales permission and warehouse eligibility are independent and both required',async()=>{
 const f=await fixture();await ctx.db.pool.query('INSERT INTO inventory_balances(product_id,warehouse_id,on_hand,reserved) VALUES($1,$2,10,3)',[f.product,f.id]);
 const basket={items:[{id:'TEST-GEL',quantity:1}],offers_id_from_merchant_center:false,locality:'Москва',is_health_check:true};
 assert.deepEqual((await f.catalog.basket(basket)).items[0]!.warehouses,[]);
 const checkout=new YcpCheckout(ctx.db,settings);
 await assert.rejects(checkout.create({session_id:'draft-no-order',warehouse_id:f.id,items:[{id:'TEST-GEL',quantity:1,regular_price:600,final_price:500}],
  customer:{full_name:'Тест',phone:'+79990000000',email:'buyer@example.test'},delivery:{delivery_method:'courier',service_type:'cdek',price:0,
   address:{locality:'Москва',address:'Тестовый адрес'},delivery_date_interval:{start_interval:{date:'2026-09-10'},end_interval:{date:'2026-09-11'},time_zone:3}}}),/WAREHOUSE_UNAVAILABLE/);
 assert.equal((await ctx.db.pool.query('SELECT count(*)::int n FROM orders')).rows[0].n,0);
 assert.equal((await ctx.db.pool.query('SELECT reserved FROM inventory_balances')).rows[0].reserved,3);
 await assert.rejects(f.registry.save(f.actor,f.id,{...f.edit,canFulfill:true}));
 await f.registry.save(f.actor,f.id,{...f.edit,canFulfill:true,address:'Тестовый подтверждённый адрес',phone:'+79990000000',servedLocalities:['*']});
 await ctx.db.pool.query("UPDATE storefront_banner SET sales_enabled=true");
 await ctx.db.pool.query("UPDATE warehouse_profiles SET can_fulfill=false");
 assert.deepEqual((await f.catalog.basket(basket)).items[0]!.warehouses,[]);
 await ctx.db.pool.query("UPDATE warehouse_profiles SET can_fulfill=true");
 assert.deepEqual((await f.catalog.basket(basket)).items[0]!.warehouses,[{id:f.id,available_quantity:7}]);
 assert.equal((await ycpWarehouses(ctx.db.pool,settings,true)).length,1);
});

test('warehouse edits require admin, detect stale revisions and keep external bindings stable',async()=>{
 const f=await fixture(),buyer=randomUUID();await ctx.db.pool.query('INSERT INTO users(id) VALUES($1)',[buyer]);
 await assert.rejects(f.registry.save(buyer,f.id,f.edit),/FORBIDDEN/);
 const writes=await Promise.allSettled(['Один','Два'].map(name=>f.registry.save(f.actor,f.id,{...f.edit,name})));
 assert.equal(writes.filter(w=>w.status==='fulfilled').length,1);assert.equal(writes.filter(w=>w.status==='rejected').length,1);
 await assert.rejects(f.registry.save(f.actor,f.id,{...f.edit,externalId:'other'}));
 assert.equal((await ctx.db.pool.query('SELECT count(*)::int n FROM warehouse_external_ids')).rows[0].n,1);
 assert.equal((await ctx.db.pool.query("SELECT count(*)::int n FROM audit_log WHERE action='warehouse.updated'")).rows[0].n,1);
});

test('conflicting CDEK mapping rolls back onboarding without touching the original warehouse',async()=>{
 const other=randomUUID();await ctx.db.pool.query("INSERT INTO warehouses(id,code,name) VALUES($1,'existing','Существующий')",[other]);
 await ctx.db.pool.query("INSERT INTO warehouse_external_ids(provider,account_id,external_id,warehouse_id) VALUES('cdek_ff','asaya','23401',$1)",[other]);
 await assert.rejects(ensureOnboardingWarehouses(ctx.db),/WAREHOUSE_BINDING_CONFLICT/);
 assert.equal((await ctx.db.pool.query('SELECT count(*)::int n FROM warehouses')).rows[0].n,1);
});

test('warehouse HTTP routes retain YCP authentication and staff Origin and CSRF protection in production mode',async()=>{
 const f=await fixture(),session='warehouse-staff-session-fixture';
 await ctx.db.pool.query("INSERT INTO staff_credentials(user_id,email,password_salt,password_hash,totp_encrypted) VALUES($1,'warehouse-admin@example.test','fixture','fixture','fixture')",[f.actor]);
 await ctx.db.pool.query("INSERT INTO staff_sessions(token_hash,user_id,created_at,expires_at) VALUES($1,$2,now(),now()+interval '1 hour')",[hash(session),f.actor]);
 const app=await buildApp({db:ctx.db,deploymentMode:'ycp',staffSecret,otpSecret:'warehouse-otp-secret-different-from-other-secrets',otpSender:new DisabledOtpSender(),origin:settings.publicOrigin,secureCookies:true,ycp:{token,settings:{...settings,environment:'production'}}});
 try{
  for(const base of ['/api/v1','/api/ycp/v1']){
   assert.equal((await app.inject({url:base+'/warehouses?limit=10&offset=0'})).statusCode,401);
   const good=await app.inject({url:base+'/warehouses?limit=10&offset=0',headers:{authorization:'Bearer '+token}});
   assert.equal(good.statusCode,200);assert.equal(good.json().total_count,1);assert.ok(!good.body.includes(token));
  }
  assert.equal((await app.inject({url:'/api/admin/v1/warehouses'})).statusCode,401);
  const url='/api/admin/v1/warehouses/'+f.id,headers={cookie:'__Host-asaya_staff='+session,origin:settings.publicOrigin};
  assert.equal((await app.inject({method:'PUT',url,headers,payload:f.edit})).statusCode,403);
  const secure={...headers,'x-csrf-token':new StaffAuth(ctx.db,staffSecret).csrf(session)};
  await ctx.db.pool.query("UPDATE staff_credentials SET staff_role='manager' WHERE user_id=$1",[f.actor]);
  const sales=(await app.inject({url:'/api/admin/v1/sales',headers})).json();
  assert.equal((await app.inject({method:'PUT',url:'/api/admin/v1/sales',headers,payload:{enabled:false,revision:sales.revision}})).statusCode,403);
  assert.equal((await app.inject({method:'PUT',url:'/api/admin/v1/sales',headers:secure,payload:{enabled:false,revision:sales.revision}})).statusCode,200);
  await ctx.db.pool.query("UPDATE staff_credentials SET staff_role='owner' WHERE user_id=$1",[f.actor]);
  assert.equal((await app.inject({method:'PUT',url,headers:{...secure,origin:'https://other.example.test'},payload:f.edit})).statusCode,403);
  assert.equal((await app.inject({method:'PUT',url,headers:secure,payload:f.edit})).statusCode,200);
 }finally{await app.close();}
});
