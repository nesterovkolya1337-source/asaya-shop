import {before,after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {testDatabase} from './postgres.js';
import {YcpCheckout} from '../src/ycp-checkout.js';
import {CommerceService} from '../src/commerce.js';
import {AdminOrders} from '../src/admin-orders.js';
import type {YcpSettings} from '../src/ycp-catalog.js';
import {buildApp} from '../src/app.js';
import {DisabledOtpSender} from '../src/auth.js';
let ctx:Awaited<ReturnType<typeof testDatabase>>,now:Date;
const token='ycp-checkout-test-token-at-least-32-characters';
before(async()=>{ctx=await testDatabase();});after(async()=>{await ctx?.stop();});
beforeEach(async()=>{await ctx.db.pool.query('TRUNCATE products,warehouses,users,customer_profiles,checkout_sessions,integration_inbox,integration_outbox CASCADE');now=new Date('2026-09-06T10:00:00Z');});
async function fixture(stock=10){
 const db=ctx.db,warehouse=randomUUID(),product=randomUUID();
 await db.pool.query("INSERT INTO warehouses(id,code,name,active) VALUES($1,'YCP-TEST','Тестовый склад',true)",[warehouse]);
 await db.pool.query("INSERT INTO products(id,sku,name,active,sale_approved,weight_g,width_mm,height_mm,depth_mm) VALUES($1,'SKU-1','Тестовый гель',true,true,500,50,190,50)",[product]);
 await db.pool.query("INSERT INTO product_prices(product_id,currency,regular_minor,final_minor,approved) VALUES($1,'RUB',60000,50000,true)",[product]);
 await db.pool.query("INSERT INTO storefront_mappings(slug,product_id,approved,confidence,reason) VALUES('ycp-gel',$1,true,'high','test')",[product]);
 await db.pool.query('INSERT INTO inventory_balances(product_id,warehouse_id,on_hand) VALUES($1,$2,$3)',[product,warehouse,stock]);
 const settings:YcpSettings={accountId:'ycp-test',environment:'test',publicOrigin:'https://asaya.example.test',priceUnit:'minor',vat:0,checkout:{deliveryPriceUnit:'rubles'},warehouses:[{warehouseId:warehouse,address:'Тестовый адрес',phone:'+79990000000',servedLocalities:['Москва'],ycpDeliveryEnabled:false}]};
 const body={session_id:'session-1',warehouse_id:warehouse,items:[{id:'SKU-1',quantity:1,regular_price:600,final_price:500}],customer:{full_name:'Тестовый покупатель',phone:'+79990000000',email:'buyer@example.test'},delivery:{delivery_method:'courier',service_type:'yandex_delivery',price:100.29,address:{locality:'Москва',address:'Тестовая, 1'},delivery_date_interval:{start_interval:{date:'2026-09-07'},end_interval:{date:'2026-09-08'},time_zone:3}}};
 const service=new YcpCheckout(db,settings,()=>now);
 const placement={session_id:body.session_id,order_id:'ycp-order-1',order_number:123,payment_method:'online',online_payment_method:'card',acquiring_id:'acquiring-1'};
 return {db,warehouse,product,settings,body,service,placement};
}
async function count(table:string){return (await ctx.db.pool.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n as number;}
async function order(){return (await ctx.db.pool.query('SELECT * FROM orders ORDER BY created_at LIMIT 1')).rows[0];}

test('official placed example without acquiring ID confirms one payment and stores optional method',async()=>{
 const f=await fixture();
 // Published Yandex request-body example, not a fabricated live customer payload.
 const payload=JSON.parse(await readFile(new URL('../../tests/fixtures/ycp-placed.json',import.meta.url),'utf8'));
 await f.service.create({...f.body,session_id:payload.session_id});
 await Promise.all(Array.from({length:8},()=>f.service.placed(payload)));
 assert.equal(await count('orders'),1);assert.equal(await count('payments'),1);assert.equal(await count('customer_profiles'),1);
 const session=(await f.db.pool.query('SELECT * FROM ycp_sessions')).rows[0];
 assert.equal(session.acquiring_id,null);assert.equal(session.online_payment_method,'split');assert.equal(session.external_order_id,payload.order_id);
 assert.equal((await order()).payment_status,'paid');
 assert.equal((await f.db.pool.query('SELECT external_id FROM payments')).rows[0].external_id,'placement:'+payload.order_id);
 assert.equal((await f.db.pool.query("SELECT 1 FROM integration_outbox WHERE kind='order.paid'")).rowCount,1);
 assert.equal(await count('shipments'),0);assert.equal(await count('auth_sessions'),0);
 await assert.rejects(f.service.placed({...payload,online_payment_method:'card'}),/PLACEMENT_CONFLICT/);
});

test('all documented payment methods persist, and absent optional fields stay absent',async()=>{
 const f=await fixture();
 for(const [index,method] of ['card','sbp','split','split_sbp',undefined].entries()){
  const session_id='method-'+index;
  await f.service.create({...f.body,session_id});
  await f.service.placed({session_id,order_id:'method-order-'+index,order_number:index+1,payment_method:'online',...(method?{online_payment_method:method,acquiring_id:'transaction-'+index}:{})});
  const saved=(await f.db.pool.query('SELECT acquiring_id,online_payment_method FROM ycp_sessions WHERE session_id=$1',[session_id])).rows[0];
  assert.equal(saved.online_payment_method,method??null);assert.equal(saved.acquiring_id,method?'transaction-'+index:null);
 }
 assert.equal(await count('payments'),5);assert.equal(await count('customer_profiles'),1);
 assert.equal((await f.db.pool.query("SELECT 1 FROM orders WHERE payment_status='paid'")).rowCount,5);
});

test('placement normalizes the checkout customer phone and reuses a profile without replacing owner edits or granting login',async()=>{
 const f=await fixture(),user=randomUUID();await f.db.pool.query('INSERT INTO users(id) VALUES($1)',[user]);
 await f.db.pool.query("INSERT INTO customer_profiles(phone,user_id) VALUES('+79990000000',$1)",[user]);
 const phones=['8 (999) 000-00-00','9990000000','+7 (999) 000-00-00'];
 for(const [i,phone] of phones.entries())await f.service.create({...f.body,session_id:'phone-'+i,customer:{...f.body.customer,phone}});
 await Promise.all(phones.map((_,i)=>f.service.placed({...f.placement,session_id:'phone-'+i,order_id:'phone-order-'+i,order_number:i+1,acquiring_id:'phone-payment-'+i})));
 assert.equal(await count('customer_profiles'),1);
 const profile=(await f.db.pool.query('SELECT * FROM customer_profiles')).rows[0];
 assert.equal(profile.name,f.body.customer.full_name);assert.equal(profile.email,f.body.customer.email);assert.equal(profile.user_id,user);
 assert.equal((await f.db.pool.query('SELECT 1 FROM orders WHERE customer_id=$1 AND customer_phone_normalized=$2',[profile.id,'+79990000000'])).rowCount,3);
 assert.equal((await f.db.pool.query('SELECT 1 FROM orders WHERE user_id=$1',[user])).rowCount,0);assert.equal(await count('auth_sessions'),0);
 await f.db.pool.query("UPDATE customer_profiles SET name='Owner name',email='owner@example.test'");
 await f.service.create({...f.body,session_id:'edited-profile'});
 await f.service.placed({...f.placement,session_id:'edited-profile',order_id:'edited-order',order_number:4,acquiring_id:'edited-payment'});
 const edited=(await f.db.pool.query('SELECT name,email FROM customer_profiles')).rows[0];assert.deepEqual(edited,{name:'Owner name',email:'owner@example.test'});
});

test('profile persistence failure returns HTTP 500 and rolls back payment, placement and customer together',async()=>{
 const f=await fixture();await f.service.create(f.body);
 const app=await buildApp({db:f.db,otpSecret:token,otpSender:new DisabledOtpSender(),origin:'http://127.0.0.1:3200',secureCookies:false,ycp:{token,settings:f.settings}});
 await f.db.pool.query("CREATE FUNCTION fail_customer_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'private customer database detail'; END $$");
 await f.db.pool.query('CREATE TRIGGER fail_customer_test BEFORE INSERT ON customer_profiles FOR EACH ROW EXECUTE FUNCTION fail_customer_test()');
 try{
  const response=await app.inject({method:'POST',url:'/api/v1/checkout/placed',headers:{authorization:'Bearer '+token},payload:f.placement});
  assert.equal(response.statusCode,500);assert.ok(!response.body.includes('private customer'));assert.ok(!response.body.includes(f.body.customer.phone));
  assert.equal(await count('payments'),0);assert.equal(await count('customer_profiles'),0);assert.equal((await order()).status,'draft');
  const s=(await f.db.pool.query('SELECT placement_hash,external_order_id,online_payment_method FROM ycp_sessions')).rows[0];
  assert.deepEqual(s,{placement_hash:null,external_order_id:null,online_payment_method:null});
 }finally{await f.db.pool.query('DROP TRIGGER fail_customer_test ON customer_profiles');await f.db.pool.query('DROP FUNCTION fail_customer_test()');await app.close();}
 await f.service.placed(f.placement);assert.equal((await order()).payment_status,'paid');assert.equal(await count('payments'),1);
});

test('checkout and placed HTTP logs correlate by internal order without exposing contact, body or credentials',async()=>{
 const f=await fixture(),records:Array<Record<string,unknown>>=[];
 const app=await buildApp({db:f.db,otpSecret:token,otpSender:new DisabledOtpSender(),origin:'http://127.0.0.1:3200',secureCookies:false,logger:true,ycp:{token,settings:f.settings}});
 app.addHook('onRequest',async req=>{req.log.info=((fields:Record<string,unknown>)=>{records.push(fields);}) as typeof req.log.info;});
 try{
  const headers={authorization:'Bearer '+token};
  const create=await app.inject({method:'POST',url:'/api/v1/checkout',headers,payload:f.body});assert.equal(create.statusCode,201);
  const placed=await app.inject({method:'POST',url:'/api/v1/checkout/placed',headers,payload:f.placement});assert.equal(placed.statusCode,200);
  for(let i=0;i<100&&!records.some(r=>r.requestId===placed.headers['x-request-id']);i++)await new Promise(r=>setTimeout(r,10));
  const logs=records.filter(r=>[create.headers['x-request-id'],placed.headers['x-request-id']].includes(String(r.requestId)));
  assert.equal(logs.length,2);assert.ok(logs.every(r=>r.orderId===(logs[0]!.orderId)&&r.correlation==='matched'));assert.ok(logs[0]!.orderId);
  const serialized=JSON.stringify(records);
  for(const value of [f.body.customer.full_name,f.body.customer.phone,f.body.customer.email,f.body.delivery.address.address,token,f.placement.acquiring_id,f.placement.session_id])assert.ok(!serialized.includes(value));
  assert.equal(await count('fulfillment_jobs'),0);assert.equal(await count('shipments'),0);
 }finally{await app.close();}
});

test('YCP creates one guest order and reservation under concurrent replay, using immutable server prices',async()=>{
 const f=await fixture();const user=randomUUID();await f.db.pool.query('INSERT INTO users(id) VALUES($1)',[user]);await f.db.pool.query("INSERT INTO user_identities(channel,destination,user_id,verified_at) VALUES('email','buyer@example.test',$1,now())",[user]);
 const responses=await Promise.all(Array.from({length:8},()=>f.service.create(f.body)));
 assert.ok(responses.every(r=>r.order_number===responses[0]!.order_number));assert.equal(await count('orders'),1);assert.equal(await count('inventory_movements'),1);assert.equal(await count('ycp_sessions'),1);
 const o=await order();assert.notEqual(o.user_id,user);assert.equal((await f.db.pool.query('SELECT disabled FROM users WHERE id=$1',[o.user_id])).rows[0].disabled,true);assert.equal(await count('user_identities'),1);assert.equal(o.total_minor,'60029');assert.equal(o.customer_snapshot.name,f.body.customer.full_name);assert.equal(o.consent_snapshot.localConsentNotAsserted,true);
 assert.equal((await f.db.pool.query('SELECT reserved FROM inventory_balances')).rows[0].reserved,1);
 await f.db.pool.query('UPDATE product_prices SET final_minor=45000');assert.deepEqual(await f.service.create(f.body),responses[0]);assert.equal((await order()).subtotal_minor,'50000');
 assert.equal((await new CommerceService(f.db).orders(user)).items.length,0);
 await assert.rejects(f.service.create({...f.body,customer:{...f.body.customer,full_name:'Изменён'}}),/SESSION_CONFLICT/);
});
test('YCP rejects changed inventory atomically and only one session gets the final item',async()=>{
 const f=await fixture(1),changed={...f.body,items:[{...f.body.items[0]!,final_price:1}]};
 await assert.rejects(f.service.create(changed),(e:any)=>{assert.equal(e.status,409);assert.equal(e.details.actual_inventory.items[0].final_price,500);assert.equal(e.details.checkout_canceled,false);return true;});
 assert.equal(await count('orders'),0);
 const r=await Promise.allSettled([f.service.create(f.body),f.service.create({...f.body,session_id:'session-2'})]);assert.equal(r.filter(i=>i.status==='fulfilled').length,1);assert.equal(await count('orders'),1);
 assert.equal((await f.db.pool.query('SELECT reserved FROM inventory_balances')).rows[0].reserved,1);
});
test('YCP checkout validates delivery mode, address, fractional money, configuration and warehouse before reserving',async()=>{
 const f=await fixture();
 for(const body of [{...f.body,warehouse_id:randomUUID()},{...f.body,items:[...f.body.items,...f.body.items]},{...f.body,items:[...f.body.items,{id:'UNKNOWN',quantity:1,regular_price:1,final_price:1}]},{...f.body,delivery:{...f.body.delivery,price:1.001}},{...f.body,delivery:{...f.body.delivery,service_type:'ycp'}},{...f.body,delivery:{...f.body.delivery,address:{locality:'Москва'}}},{...f.body,delivery:{...f.body.delivery,address:{locality:'Казань',address:'Адрес'}}}])await assert.rejects(f.service.create(body));
 assert.equal(await count('orders'),0);assert.equal(await count('inventory_movements'),0);
 const rubles=new YcpCheckout(f.db,{...f.settings,priceUnit:null,vat:null,checkout:undefined});
 await rubles.create({...f.body,items:[{id:'SKU-1',quantity:1,regular_price:600,final_price:500}]});assert.equal((await order()).total_minor,'60029');
});
test('YCP online placement is atomic and idempotent and cannot be cancelled as an unfinished checkout',async()=>{
 const f=await fixture();await f.service.create(f.body);
 assert.equal(await count('customer_profiles'),0);
 await Promise.all(Array.from({length:5},()=>f.service.placed(f.placement)));
 assert.equal((await f.db.pool.query("SELECT points FROM loyalty_ledger WHERE type='purchase_cashback'")).rows[0].points,'15');
 assert.equal((await f.db.pool.query("SELECT count(*)::int n FROM loyalty_ledger WHERE type='purchase_cashback'")).rows[0].n,1);
 const o=await order();assert.equal(o.status,'placed');assert.equal(o.payment_status,'paid');assert.equal(o.external_ycp_order_id,'ycp-order-1');assert.equal(await count('payments'),1);
 assert.equal(await count('customer_profiles'),1);assert.equal(o.customer_phone_normalized,'+79990000000');assert.ok(o.customer_id);
 assert.equal((await f.db.pool.query('SELECT user_id FROM customer_profiles')).rows[0].user_id,null);
 assert.equal(await count('auth_sessions'),0);
 assert.equal((await f.db.pool.query('SELECT amount_minor FROM payments')).rows[0].amount_minor,'60029');assert.equal((await f.db.pool.query('SELECT reserved,on_hand FROM inventory_balances')).rows[0].reserved,1);
 assert.equal((await f.db.pool.query("SELECT 1 FROM integration_outbox WHERE kind='order.paid'")).rowCount,1);
 await assert.rejects(f.service.placed({...f.placement,order_id:'different'}),/PLACEMENT_CONFLICT/);
 await assert.rejects(f.service.cancel({session_id:f.body.session_id}),/CANCELLATION_REQUIRES_REVIEW/);
 now=new Date(now.getTime()+7200000);assert.equal(await new CommerceService(f.db,()=>now).expire(),0);
 const actor=randomUUID();await f.db.pool.query("INSERT INTO users(id,role) VALUES($1,'admin')",[actor]);await new CommerceService(f.db).adminStartProcessing(actor,o.id,{});
 const detail=await new AdminOrders(f.db).detail(actor,o.id);assert.equal(detail.customer.name,f.body.customer.full_name);assert.equal(detail.delivery.city,'Москва');assert.equal(detail.delivery.address,'Тестовая, 1');
 await f.service.placed(f.placement);assert.equal((await order()).status,'processing');
});
test('YCP cash on delivery placement does not mark the order paid or expire its reservation',async()=>{
 const f=await fixture();await f.service.create(f.body);
 await f.service.placed({session_id:f.body.session_id,order_id:'cash-order',order_number:1,payment_method:'on_delivery'});
 assert.equal((await order()).status,'placed');assert.equal((await order()).payment_status,'pending');assert.equal(await count('payments'),0);
 now=new Date(now.getTime()+7200000);assert.equal(await new CommerceService(f.db,()=>now).expire(),0);
 await assert.rejects(f.service.placed(f.placement),/PLACEMENT_CONFLICT/);
});
test('YCP repeated cancellation releases once and late online placement records review without reviving stock',async()=>{
 const f=await fixture();await f.service.create(f.body);
 await Promise.all([f.service.cancel({session_id:f.body.session_id}),f.service.cancel({session_id:f.body.session_id})]);
 assert.equal((await f.db.pool.query('SELECT reserved FROM inventory_balances')).rows[0].reserved,0);
 assert.equal((await f.db.pool.query("SELECT 1 FROM inventory_movements WHERE kind='release'")).rowCount,1);
 await assert.rejects(f.service.create(f.body),(e:any)=>e.details.checkout_canceled===true);
 for(let i=0;i<2;i++)await assert.rejects(f.service.placed(f.placement),/CHECKOUT_CANCELLED/);
 assert.equal((await order()).status,'cancelled');assert.equal(await count('payments'),1);assert.equal((await f.db.pool.query('SELECT reserved FROM inventory_balances')).rows[0].reserved,0);
 assert.equal((await f.db.pool.query("SELECT 1 FROM integration_outbox WHERE kind='ycp.placement_after_cancel'")).rowCount,1);
 assert.equal((await f.db.pool.query("SELECT 1 FROM integration_outbox WHERE kind='order.paid'")).rowCount,0);
 assert.equal((await order()).payment_status,'paid');assert.ok((await order()).customer_id);
});
test('YCP expiry and placement races never revive released reservations',async()=>{
 const f=await fixture();await f.service.create(f.body);now=new Date(now.getTime()+3601000);
 await Promise.allSettled([f.service.placed(f.placement),new CommerceService(f.db,()=>now).expire()]);
 const o=await order(),reserved=(await f.db.pool.query('SELECT reserved FROM inventory_balances')).rows[0].reserved;
 assert.ok((o.status==='placed'&&o.payment_status==='paid'&&reserved===1)||(o.status==='cancelled'&&reserved===0));assert.equal(await count('payments'),1);
});
test('YCP identifiers, account scope and acquiring IDs cannot bind a second order',async()=>{
 const f=await fixture();await f.service.create(f.body);await f.service.create({...f.body,session_id:'session-2'});
 await assert.rejects(new YcpCheckout(f.db,{...f.settings,accountId:'other'}).placed(f.placement),/CHECKOUT_NOT_FOUND/);
 await assert.rejects(f.service.placed({...f.placement,payment_method:'on_delivery'}));
 await assert.rejects(f.service.placed(f.placement,{session_id:'wrong'}),/PLACEMENT_QUERY_CONFLICT/);
 await f.service.placed(f.placement,{session_id:f.body.session_id,order_id:f.placement.order_id,payment_method:'online'});
 await assert.rejects(f.service.placed({...f.placement,session_id:'session-2',acquiring_id:'different'}),/YCP_ORDER_CONFLICT/);
 await assert.rejects(f.service.placed({...f.placement,session_id:'session-2',order_id:'order-2',order_number:124}),/PAYMENT_ORDER_CONFLICT/);
 assert.equal(await count('payments'),1);
});
test('YCP checkout rollback includes reservation, order and session binding when audit insertion fails',async()=>{
 const f=await fixture();await f.db.pool.query("CREATE FUNCTION ycp_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test failure'; END $$");
 await f.db.pool.query('CREATE TRIGGER ycp_test_fail BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION ycp_test_fail()');
 try{await assert.rejects(f.service.create(f.body),/test failure/);assert.equal(await count('orders'),0);assert.equal(await count('ycp_sessions'),0);assert.equal((await f.db.pool.query('SELECT reserved FROM inventory_balances')).rows[0].reserved,0);}
 finally{await f.db.pool.query('DROP TRIGGER ycp_test_fail ON audit_log');await f.db.pool.query('DROP FUNCTION ycp_test_fail()');}
 await f.service.create(f.body);assert.equal(await count('orders'),1);
});
test('YCP placement and cancellation roll back all financial and inventory effects on audit failure',async()=>{
 const f=await fixture();await f.service.create(f.body);
 await f.db.pool.query("CREATE FUNCTION ycp_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test failure'; END $$");
 await f.db.pool.query('CREATE TRIGGER ycp_test_fail BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION ycp_test_fail()');
 try{
  await assert.rejects(f.service.placed(f.placement),/test failure/);assert.equal(await count('payments'),0);assert.equal((await order()).status,'draft');
  assert.equal((await f.db.pool.query('SELECT placement_hash FROM ycp_sessions')).rows[0].placement_hash,null);
  await assert.rejects(f.service.cancel({session_id:f.body.session_id}),/test failure/);assert.equal((await order()).status,'draft');
  assert.equal((await f.db.pool.query('SELECT reserved FROM inventory_balances')).rows[0].reserved,1);assert.equal((await f.db.pool.query("SELECT 1 FROM inventory_movements WHERE kind='release'")).rowCount,0);
 }finally{await f.db.pool.query('DROP TRIGGER ycp_test_fail ON audit_log');await f.db.pool.query('DROP FUNCTION ycp_test_fail()');}
 await f.service.placed(f.placement);assert.equal((await order()).payment_status,'paid');
});

test('YCP checkout HTTP requires Bearer before parsing and follows create, conflict, placed and cancel contracts',async()=>{
 const f=await fixture(),app=await buildApp({db:f.db,otpSecret:token,otpSender:new DisabledOtpSender(),origin:'http://127.0.0.1:3200',secureCookies:false,ycp:{token,settings:f.settings}});
 const headers={authorization:'Bearer '+token},base='/api/ycp/v1/checkout';
 try{
  for(const path of ['', '/placed','/cancel?session_id=session-1'])assert.equal((await app.inject({method:'POST',url:base+path,headers:{'content-type':'application/json'},payload:'{broken'})).statusCode,401);
  const conflict=await app.inject({method:'POST',url:base,headers,payload:{...f.body,items:[{...f.body.items[0]!,final_price:1}]}});assert.equal(conflict.statusCode,409);assert.equal(conflict.json().actual_inventory.items[0].final_price,500);
  const created=await app.inject({method:'POST',url:base,headers,payload:f.body});assert.equal(created.statusCode,201);assert.ok(created.json().order_number.startsWith('ASAYA-'));assert.equal(created.headers['cache-control'],'no-store');
  assert.equal((await app.inject({method:'POST',url:base+'/placed',headers,payload:f.placement})).statusCode,200);
  assert.equal((await app.inject({method:'POST',url:base+'/cancel?session_id=session-1',headers})).statusCode,409);
  assert.equal((await app.inject({method:'POST',url:base,headers,payload:{...f.body,session_id:'session-2'}})).statusCode,201);
  assert.equal((await app.inject({method:'POST',url:base+'/cancel?session_id=session-2',headers})).statusCode,200);
  assert.equal((await app.inject({method:'POST',url:base+'/cancel?session_id=missing',headers})).statusCode,404);
 }finally{await app.close();}
});
