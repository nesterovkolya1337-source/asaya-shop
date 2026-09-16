import {after,afterEach,before,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {testDatabase} from './postgres.js';
import {createTestShop,testShopOrigin} from '../scripts/test-shop-app.js';

let ctx:Awaited<ReturnType<typeof testDatabase>>,shop:Awaited<ReturnType<typeof createTestShop>>,cookie:string,csrf:string,productId:string;
const host=new URL(testShopOrigin).host;
before(async()=>{ctx=await testDatabase();});
after(async()=>{await ctx?.stop();});
beforeEach(async()=>{
 await ctx.db.pool.query('TRUNCATE products,warehouses,users,checkout_sessions,integration_inbox,integration_outbox CASCADE');
 shop=await createTestShop(ctx.db,[{sku:'TEST-A',name:'Тестовый шампунь',slug:'hair-shampoo'},{sku:'TEST-B',name:'Тестовый крем',slug:'coconut-body-cream'}]);
 const open=await shop.app.inject({method:'POST',url:'/test-shop/open',headers:{host,origin:testShopOrigin,'x-asaya-test-key':new URL(shop.openUrl).hash.slice(1)},payload:{}});
 assert.equal(open.statusCode,200,open.body);assert.deepEqual(open.cookies.map(c=>c.name),['asaya_local_test_staff']);cookie=open.cookies.map(c=>c.name+'='+c.value).join('; ');
 const state=await getState();csrf=state.csrfToken;productId=state.items[0].id;
});
afterEach(async()=>{await shop?.app.close();});
async function getState(){const r=await shop.app.inject({url:'/test-shop/api/state',headers:{host,cookie}});assert.equal(r.statusCode,200,r.body);return r.json();}
async function mutate(url:string,payload:object,method:'POST'|'PUT'='POST'){
 return shop.app.inject({url,method,headers:{host,origin:testShopOrigin,cookie,'x-csrf-token':csrf},payload});
}
async function stock(onHand:number,expectedOnHand=0){return mutate('/test-shop/api/stock/'+productId,{onHand,expectedOnHand},'PUT');}
async function create(quantity:number,sessionId=randomUUID()){
 const r=await mutate('/test-shop/api/sessions',{sessionId,items:[{sku:'TEST-A',quantity}]});return {r,sessionId};
}
const act=(id:string,action:string)=>mutate('/test-shop/api/sessions/'+id+'/'+action,{});

test('test stock requires staff, CSRF and origin; test API rejects rebinding and live checkout stays disabled',async()=>{
 assert.equal((await shop.app.inject({url:'/test-shop/api/state',headers:{host}})).statusCode,401);
 assert.equal((await shop.app.inject({url:'/test-shop/api/state',headers:{host:'attacker.example',cookie}})).statusCode,403);
 assert.equal((await shop.app.inject({url:'/test-shop/api/stock/'+productId,method:'PUT',headers:{host,origin:testShopOrigin,cookie},payload:{onHand:10,expectedOnHand:0}})).statusCode,403);
 assert.equal((await shop.app.inject({url:'/test-shop/api/stock/'+productId,method:'PUT',headers:{host,origin:'https://other.example',cookie,'x-csrf-token':csrf},payload:{onHand:10,expectedOnHand:0}})).statusCode,403);
 assert.equal((await stock(-1)).statusCode,400);assert.equal((await stock(1.5)).statusCode,400);
 assert.equal((await stock(1000001)).statusCode,400);
 const reused=await shop.app.inject({method:'POST',url:'/test-shop/open',headers:{host,origin:testShopOrigin,'x-asaya-test-key':new URL(shop.openUrl).hash.slice(1)},payload:{}});assert.equal(reused.statusCode,401);
 assert.equal((await shop.app.inject({url:'/api/v1/warehouses?limit=10&offset=0',headers:{host}})).statusCode,401);
 const link=await shop.app.inject({url:'/api/store/v1/yandex/checkout-link',method:'POST',headers:{host,origin:testShopOrigin,'idempotency-key':randomUUID()},payload:{items:[{sku:'TEST-A',quantity:1}]}});
 assert.equal(link.statusCode,503);assert.equal(link.json().error,'YANDEX_CHECKOUT_UNAVAILABLE');
 const page=await shop.app.inject({url:'/',headers:{host}});assert.equal(page.statusCode,200);assert.match(page.headers['content-security-policy'] as string,/connect-src 'self'/);
 assert.equal((await getState()).items[0].onHand,0);
});
test('manual test stock reaches YCP basket; reserve, shortage, conflict and cancellation behave correctly',async()=>{
 const before=await getState();assert.ok(before.items.every((p:any)=>p.onHand===0&&p.ycpAvailable===0));
 assert.equal((await stock(10)).statusCode,200);
 const order=await create(2);assert.equal(order.r.statusCode,200,order.r.body);
 const state=await getState();assert.equal(state.orders.length,1);assert.equal(state.items[0].reserved,2);assert.equal(state.items[0].ycpAvailable,8);
 assert.equal((await stock(1,10)).json().error,'STOCK_RESERVED');
 assert.equal((await stock(12,0)).json().error,'STOCK_CONFLICT');
 assert.equal((await create(9)).r.json().error,'INVENTORY_CHANGED');
 assert.equal((await act(order.sessionId,'cancel')).statusCode,200);assert.equal((await act(order.sessionId,'cancel')).statusCode,200);
 const cancelled=await getState();assert.equal(cancelled.items[0].reserved,0);assert.equal(cancelled.items[0].onHand,10);assert.equal(cancelled.items[0].ycpAvailable,10);
 assert.equal((await ctx.db.pool.query("SELECT count(*)::int n FROM inventory_movements WHERE kind='release'")).rows[0].n,1);
});
test('duplicate create/pay/deliver produce one test order, payment and stock consumption',async()=>{
 await stock(10);const id=randomUUID();
 const duplicates=await Promise.all([create(2,id),create(2,id)]);for(const d of duplicates)assert.equal(d.r.statusCode,200,d.r.body);
 assert.equal((await act(id,'deliver')).json().error,'TEST_PAYMENT_REQUIRED');
 for(let i=0;i<2;i++){const payment=await act(id,'pay');assert.equal(payment.statusCode,200,payment.body);}
 for(let i=0;i<2;i++){const delivery=await act(id,'deliver');assert.equal(delivery.statusCode,200,delivery.body);}
 const state=await getState();assert.equal(state.orders.length,1);assert.equal(state.orders[0].status,'completed');
 assert.equal(state.items[0].reserved,0);assert.equal(state.items[0].onHand,8);assert.equal(state.items[0].ycpAvailable,8);
 const payments=(await ctx.db.pool.query('SELECT environment FROM payments')).rows;assert.equal(payments.length,1);assert.equal(payments[0].environment,'test');
 assert.equal((await act(id,'cancel')).json().error,'DELIVERED_ORDER_REQUIRES_RETURN');
 assert.equal((await act(randomUUID(),'pay')).statusCode,404);
});
test('paid test cancellation releases stock once and requests refund review without pretending a real refund',async()=>{
 await stock(10);const order=await create(3);await act(order.sessionId,'pay');
 for(let i=0;i<2;i++)assert.equal((await act(order.sessionId,'cancel')).statusCode,200);
 const state=await getState();assert.equal(state.items[0].onHand,10);assert.equal(state.items[0].reserved,0);assert.equal(state.orders[0].paymentStatus,'paid');assert.equal(state.orders[0].status,'cancelled');
 assert.equal((await ctx.db.pool.query("SELECT count(*)::int n FROM integration_outbox WHERE kind='payment.refund_review'")).rows[0].n,1);
 assert.equal((await ctx.db.pool.query("SELECT count(*)::int n FROM ycp_sessions WHERE environment<>'test'")).rows[0].n,0);
});
