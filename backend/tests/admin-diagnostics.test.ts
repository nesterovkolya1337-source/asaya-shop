import {before,after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {testDatabase} from './postgres.js';
import {AdminOrders} from '../src/admin-orders.js';
import {OrderTracking} from '../src/order-tracking.js';
import {StaffAuth,totp,decodeBase32} from '../src/staff-auth.js';
import {buildApp} from '../src/app.js';
import {DisabledOtpSender} from '../src/auth.js';
let ctx:Awaited<ReturnType<typeof testDatabase>>;
before(async()=>{ctx=await testDatabase();});after(async()=>{await ctx?.stop();});
beforeEach(async()=>{await ctx.db.pool.query('TRUNCATE users,products,warehouses,rate_limits CASCADE');});
const secret='admin-diagnostic-test-secret-'.repeat(3),key='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',password='Fixture-password-01';
async function fixture(){
 const db=ctx.db,order=randomUUID(),user=randomUUID(),product=randomUUID(),checkout=randomUUID(),shipment=randomUUID();
 const actor=await new StaffAuth(db,secret).provision('staff@example.test',password,key);
 await db.pool.query('INSERT INTO users(id) VALUES($1)',[user]);
 await db.pool.query("INSERT INTO products(id,sku,name) VALUES($1,'SKU','Test')",[product]);
 await db.pool.query("INSERT INTO checkout_sessions(id,user_id,status,snapshot,expires_at) VALUES($1,$2,'placed','{}',now()+interval '1 hour')",[checkout,user]);
 await db.pool.query(`INSERT INTO orders(id,public_number,checkout_id,user_id,status,payment_status,delivery_status,currency,subtotal_minor,delivery_minor,total_minor,customer_snapshot,delivery_snapshot,consent_snapshot)
 VALUES($1,'ASAYA-'||nextval('public_order_sequence'),$2,$3,'placed','paid','not_created','RUB',50000,0,50000,'{}','{}','{}')`,[order,checkout,user]);
 await db.pool.query("INSERT INTO order_items(order_id,product_id,sku,name_snapshot,quantity,unit_minor,line_minor) VALUES($1,$2,'SKU','Test',1,50000,50000)",[order,product]);
 await db.pool.query("INSERT INTO ycp_sessions(account_id,environment,session_id,order_id,request_hash,external_order_id,external_order_number) VALUES('ycp-fixture','test','session-fixture',$1,'private-hash','yandex-fixture',12345)",[order]);
 await db.pool.query("INSERT INTO order_logistics(order_id,account_id,environment,cdek_uuid,tracking_number) VALUES($1,'fixture','test',$2,'1234567890')",[order,shipment]);
 let gets=0,fail=false;
 const tracking=new OrderTracking(db,{order:async expected=>{gets++;assert.equal(expected.uuid,shipment);if(fail)throw new Error('provider secret never exposed');return {uuid:shipment,trackingNumber:'1234567890',events:[{rawStatus:'CREATED',status:'created',occurredAt:new Date().toISOString(),deleted:false}]};}},{accountId:'fixture',environment:'test'});
 return {db,actor,user,order,shipment,tracking,gets:()=>gets,fail:()=>{fail=true;}};
}
test('admin diagnostics include Yandex and existing CDEK binding without requiring a fulfillment job',async()=>{
 const f=await fixture(),admin=new AdminOrders(f.db,f.tracking),d=await admin.detail(f.actor,f.order);
 assert.equal(d.fulfillment,null);assert.equal(d.diagnostics.yandexOrderId,'yandex-fixture');assert.equal(d.diagnostics.yandexOrderNumber,'12345');assert.equal(d.diagnostics.cdekUuid,f.shipment);assert.equal(d.diagnostics.canRefresh,true);
 assert.ok(!JSON.stringify(d).includes('private-hash'));assert.ok(!JSON.stringify(d).includes('ycp-fixture'));
 await assert.rejects(admin.detail(f.user,f.order),/FORBIDDEN/);
 await admin.refreshDelivery(f.actor,f.order,{});assert.equal(f.gets(),1);
 const fresh=await admin.detail(f.actor,f.order);assert.equal(fresh.diagnostics.rawDeliveryStatus,'CREATED');assert.ok(fresh.diagnostics.lastDeliveryUpdate);assert.equal(fresh.payment_status,'paid');
 assert.equal((await f.db.pool.query('SELECT 1 FROM fulfillment_jobs')).rowCount,0);assert.equal((await f.db.pool.query('SELECT 1 FROM order_dispatch')).rowCount,0);
 assert.equal((await f.db.pool.query("SELECT 1 FROM audit_log WHERE entity_id=$1 AND action='order.cdek_refreshed'",[f.order])).rowCount,1);
 await assert.rejects(admin.refreshDelivery(f.actor,f.order,{}),/CDEK_REFRESH_COOLDOWN/);assert.equal(f.gets(),1);
});
test('refresh rejects missing or cross-account bindings and failures preserve the last known state',async()=>{
 const f=await fixture();assert.equal(await new OrderTracking(f.db,{order:async()=>{throw Error('must not run');}},{accountId:'other',environment:'test'}).canRefresh(f.order),false);
 await assert.rejects(f.tracking.manualRefresh(randomUUID()),/SHIPMENT_NOT_FOUND/);
 f.fail();await assert.rejects(f.tracking.manualRefresh(f.order),/CDEK_REFRESH_FAILED/);assert.equal(f.gets(),1);
 const d=await new AdminOrders(f.db,f.tracking).detail(f.actor,f.order);assert.equal(d.diagnostics.deliveryUpdateFailed,true);assert.equal(d.diagnostics.lastDeliveryUpdate,null);assert.equal(d.payment_status,'paid');assert.ok(!JSON.stringify(d).includes('provider secret'));
 await assert.rejects(f.tracking.manualRefresh(f.order),/CDEK_REFRESH_COOLDOWN/);assert.equal(f.gets(),1);
});
test('catalog HTTP refresh uses staff cookie, origin and CSRF and leaves legacy shipping actions blocked',async()=>{
 const f=await fixture(),origin='https://asaya.example.test';
 const app=await buildApp({deploymentMode:'catalog',db:f.db,otpSecret:'o'.repeat(40),staffSecret:secret,otpSender:new DisabledOtpSender(),origin,secureCookies:true,cdekTracking:{service:f.tracking,secret:'c'.repeat(40)}});
 try{
  const url='/api/admin/v1/orders/'+f.order+'/cdek/refresh';
  assert.equal((await app.inject({method:'POST',url,headers:{origin},payload:{}})).statusCode,401);
  const login=await app.inject({method:'POST',url:'/api/admin/v1/auth/login',headers:{origin},payload:{email:'staff@example.test',password,code:totp(decodeBase32(key),Math.floor(Date.now()/30000))}});assert.equal(login.statusCode,200);
  const cookie=String(login.headers['set-cookie']).split(';')[0]!,headers={origin,cookie,'x-csrf-token':login.json().csrfToken};
  assert.equal((await app.inject({method:'POST',url,headers:{origin,cookie},payload:{}})).statusCode,403);
  assert.equal((await app.inject({method:'POST',url,headers:{...headers,origin:'https://other.test'},payload:{}})).statusCode,403);
  assert.equal((await app.inject({method:'POST',url,headers,payload:{shipment:'invented'}})).statusCode,400);assert.equal(f.gets(),0);
  assert.equal((await app.inject({method:'POST',url,headers,payload:{}})).statusCode,200);assert.equal(f.gets(),1);
  assert.equal((await app.inject({method:'POST',url:'/api/admin/v1/orders/'+f.order+'/dispatch',headers,payload:{}})).statusCode,503);
 }finally{await app.close();}
});
