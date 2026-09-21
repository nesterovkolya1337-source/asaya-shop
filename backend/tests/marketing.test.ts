import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {testDatabase} from './postgres.js';
import {Marketing} from '../src/marketing.js';
import {priceCart,cartPricing} from '../src/cart-pricing.js';
import {StaffAuth} from '../src/staff-auth.js';
import {YandexFeed} from '../src/yandex-feed.js';
import {YcpCatalog,type YcpSettings} from '../src/ycp-catalog.js';
import {YcpCheckout} from '../src/ycp-checkout.js';
import {buildApp} from '../src/app.js';
import {DisabledOtpSender} from '../src/auth.js';
const defaults={loyalty:{cashbackPercent:3,maxRedemptionPercent:20},twoPercent:5,threePercent:10,freeShippingMinor:100000};
let ctx:Awaited<ReturnType<typeof testDatabase>>;
before(async()=>{ctx=await testDatabase();});after(async()=>ctx?.stop());
test('quantity units, repeated SKU, sale price, sets, downward transitions and configurable shipping',()=>{
 const line={sku:'A',quantity:1,finalMinor:80000,eligible:true},set={sku:'SET',quantity:1,finalMinor:150000,eligible:false};
 for(const [quantity,percent,unit] of [[1,0,80000],[2,5,76000],[3,10,72000],[2,5,76000],[1,0,80000]] as const){
  const q=priceCart([{...line,quantity}],defaults);assert.equal(q.percent,percent);assert.equal(q.items[0]!.unitMinor,unit);
 }
 assert.equal(priceCart([line,set],defaults).percent,0);
 const q=priceCart([{...line,quantity:3},set],defaults);assert.equal(q.eligibleUnits,3);assert.equal(q.items[1]!.unitMinor,150000);assert.equal(q.subtotalMinor,366000);
 assert.equal(priceCart([line],{...defaults,freeShippingMinor:120000}).shippingRemainingMinor,40000);
 assert.equal(priceCart([{...line,quantity:2}],{...defaults,twoPercent:8}).items[0]!.unitMinor,73600);
 assert.equal(priceCart([{...line,quantity:3,finalMinor:79900}],defaults).items[0]!.unitMinor,71900);
});
test('draft/live/default separation, manager permissions, conflict and audit',async()=>{
 const db=ctx.db,a=new StaffAuth(db,'marketing-test-secret-with-at-least-32-characters');
 const admin=await a.provision('marketing-admin@example.test','Marketing-test-password-123','GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
 const manager=await a.provision('marketing-manager@example.test','Marketing-test-password-123','GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
 await db.pool.query("UPDATE staff_credentials SET staff_role='manager' WHERE user_id=$1",[manager]);
 const m=new Marketing(db);let state=await m.read();assert.deepEqual(state.live,defaults);
 const current={...defaults,twoPercent:7};state=await m.change(manager,'save',{revision:state.revision,settings:current});
 assert.deepEqual(state.live,defaults);assert.deepEqual(state.draft,current);
 await assert.rejects(m.change(manager,'defaults',{revision:state.revision,settings:current,confirmed:true}),/FORBIDDEN/);
 await assert.rejects(m.change(admin,'defaults',{revision:state.revision,settings:current}),/CONFIRMATION_REQUIRED/);
 const preset={...defaults,threePercent:12};state=await m.change(admin,'defaults',{revision:state.revision,settings:preset,confirmed:true});
 assert.deepEqual(state.live,defaults);assert.deepEqual(state.draft,current);assert.deepEqual(state.defaults,preset);
 await assert.rejects(m.change(manager,'publish',{revision:0}),/REVISION_CONFLICT/);
 state=await m.change(manager,'publish',{revision:state.revision});assert.deepEqual(state.live,current);
 state=await m.change(manager,'restore',{revision:state.revision});assert.deepEqual(state.draft,preset);assert.deepEqual(state.live,current);
 assert.equal((await db.pool.query("SELECT count(*)::int n FROM audit_log WHERE action LIKE 'marketing.%'")).rows[0].n,4);
 await db.pool.query('UPDATE marketing_settings SET defaults=$1,draft=$1,live=$1',[defaults]);
});
test('canonical published classification and price shared by cart, button, basket and order, without stock or shipment changes',async()=>{
 const db=ctx.db,product=randomUUID(),bundle=randomUUID(),warehouse=randomUUID();
 await db.pool.query("INSERT INTO warehouses(id,code,name,active) VALUES($1,'MARKETING','Test',true)",[warehouse]);
 for(const [id,sku,category] of [[product,'M-SKU','body'],[bundle,'M-SET','sets']]){
  await db.pool.query('INSERT INTO products(id,sku,name,active,sale_approved) VALUES($1,$2,$3,true,true)',[id,sku,'Name is not classification']);
  await db.pool.query("INSERT INTO product_prices(product_id,currency,regular_minor,final_minor,approved) VALUES($1,'RUB',100000,80000,true)",[id]);
  await db.pool.query('INSERT INTO inventory_balances(product_id,warehouse_id,on_hand) VALUES($1,$2,10)',[id,warehouse]);
  await db.pool.query("INSERT INTO storefront_mappings(slug,product_id,approved,confidence,reason) VALUES($1,$2,true,'high','test')",[sku,id]);
  await db.pool.query('INSERT INTO product_editor(product_id,revision,draft,published) VALUES($1,1,$2,$3)',[id,{content:{category:'sets',setKind:'gift'}},{content:{category,setKind:'none'}}]);
 }
 const items=[{sku:'M-SKU',quantity:3},{sku:'M-SET',quantity:1}],q=await cartPricing(db.pool,{items});
 assert.equal(q.subtotalMinor,296000);assert.equal(q.eligibleUnits,3);
 assert.equal((await cartPricing(db.pool,{items:[]})).subtotalMinor,0);
 const settings:YcpSettings={accountId:'marketing',environment:'test',publicOrigin:'https://asaya.example.test',button:{enabled:true},warehouses:[{warehouseId:warehouse,address:'Test',phone:'+79990000000',servedLocalities:['*'],ycpDeliveryEnabled:true}]};
 const link=await new YandexFeed(db,settings).checkoutLink({items});
 const payload=JSON.parse(Buffer.from(new URL(link.url).searchParams.get('data')!,'base64').toString());
 assert.equal(payload.items.find((i:{id:string})=>i.id==='M-SKU').final_price,720);assert.equal(payload.items.find((i:{id:string})=>i.id==='M-SET').final_price,800);
 const basket=await new YcpCatalog(db,'a-long-marketing-api-test-token-here',settings).basket({items:items.map(i=>({id:i.sku,quantity:i.quantity})),offers_id_from_merchant_center:false,locality:'Москва',is_health_check:false});
 assert.deepEqual(basket.items.map(i=>i.final_price),[720,800]);
 assert.equal((await db.pool.query('SELECT count(*)::int n FROM shipments')).rows[0].n,0);
 const service=new YcpCheckout(db,settings);
 await service.create({session_id:'marketing-order',warehouse_id:warehouse,items:basket.items.map((i,index)=>({id:i.id,quantity:items[index]!.quantity,regular_price:i.regular_price,final_price:i.final_price})),customer:{full_name:'Test',phone:'+79990000000',email:'test@example.test'},delivery:{delivery_method:'pickup_point',service_type:'cdek',price:0,address:{locality:'Москва',pickup_point_id:'test'},delivery_date_interval:{start_interval:{date:'2026-10-01'},end_interval:{date:'2026-10-02'},time_zone:3}}});
 assert.equal((await db.pool.query('SELECT subtotal_minor FROM orders')).rows[0].subtotal_minor,'296000');
 assert.ok((await db.pool.query('SELECT final_minor FROM product_prices')).rows.every(r=>r.final_minor==='80000'));
 assert.equal((await db.pool.query('SELECT count(*)::int n FROM shipments')).rows[0].n,0);
 const app=await buildApp({db,otpSecret:'marketing-test-secret-with-at-least-32-characters',otpSender:new DisabledOtpSender(),origin:'http://localhost:3200',secureCookies:false,staffSecret:'marketing-test-secret-with-at-least-32-characters',deploymentMode:'catalog'});
 try{const res=await app.inject({method:'POST',url:'/api/store/v1/cart/pricing',headers:{origin:'http://localhost:3200'},payload:{items}});assert.equal(res.statusCode,200);assert.equal(res.json().subtotalMinor,296000);
 assert.equal((await app.inject({method:'POST',url:'/api/store/v1/cart/pricing',headers:{origin:'https://evil.example'},payload:{items}})).statusCode,403);
 assert.equal((await app.inject({method:'POST',url:'/api/admin/v1/marketing/publish',headers:{origin:'http://localhost:3200'},payload:{revision:0}})).statusCode,401);
 }finally{await app.close();}
});

 test('whole-ruble discounted unit is identical in cart, redirect, basket and persisted order',async()=>{
 const db=ctx.db;await db.pool.query("UPDATE product_prices SET final_minor=79900 WHERE product_id=(SELECT id FROM products WHERE sku='M-SKU')");
 const items=[{sku:'M-SKU',quantity:3}],q=await cartPricing(db.pool,{items});
 assert.equal(q.items[0]!.unitMinor,71900);assert.equal(q.subtotalMinor,215700);
 const warehouse=(await db.pool.query("SELECT id FROM warehouses WHERE code='MARKETING'")).rows[0].id;
 const settings:YcpSettings={accountId:'kopecks',environment:'test',publicOrigin:'https://asaya.example.test',button:{enabled:true},warehouses:[{warehouseId:warehouse,address:'Test',phone:'+79990000000',servedLocalities:['*'],ycpDeliveryEnabled:true}]};
 const result=await new YandexFeed(db,settings).checkoutLink({items});
 const data=JSON.parse(Buffer.from(new URL(result.url).searchParams.get('data')!,'base64').toString());
 assert.equal(data.items[0].final_price,719);assert.equal(Math.round(data.items[0].final_price*100)*3,q.subtotalMinor);
 assert.equal((await db.pool.query("SELECT final_minor FROM product_prices WHERE product_id=(SELECT id FROM products WHERE sku='M-SKU')")).rows[0].final_minor,'79900');
 const basket=await new YcpCatalog(db,'kopeck-test-token-at-least-32-characters',settings).basket({items:[{id:'M-SKU',quantity:3}],offers_id_from_merchant_center:false,locality:'Москва',is_health_check:false});
 assert.equal(basket.items[0]!.final_price,data.items[0].final_price);
 const created=await new YcpCheckout(db,settings).create({session_id:'rounded-order',warehouse_id:warehouse,items:[{id:'M-SKU',quantity:3,regular_price:1000,final_price:719}],customer:{full_name:'Test',phone:'+79990000000',email:'test@example.test'},delivery:{delivery_method:'pickup_point',service_type:'cdek',price:0,address:{locality:'Москва',pickup_point_id:'test'},delivery_date_interval:{start_interval:{date:'2026-10-01'},end_interval:{date:'2026-10-02'},time_zone:3}}});
 const order=(await db.pool.query('SELECT id,subtotal_minor,total_minor FROM orders WHERE public_number=$1',[created.order_number])).rows[0];
 assert.equal(Number(order.subtotal_minor),q.subtotalMinor);assert.equal(Number(order.total_minor),215700);
 const line=(await db.pool.query('SELECT unit_minor,line_minor FROM order_items WHERE order_id=$1',[order.id])).rows[0];
 assert.equal(Number(line.unit_minor),71900);assert.equal(Number(line.line_minor),215700);
 });
