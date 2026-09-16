import {before,after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {testDatabase} from './postgres.js';
import {AdminStatistics} from '../src/admin-statistics.js';
import {buildApp} from '../src/app.js';
import {DisabledOtpSender} from '../src/auth.js';
let ctx:Awaited<ReturnType<typeof testDatabase>>;
const now=new Date('2026-09-07T12:00:00Z');
before(async()=>{ctx=await testDatabase();});after(async()=>{await ctx?.stop();});
beforeEach(async()=>{await ctx.db.pool.query('TRUNCATE products,warehouses,users,checkout_sessions CASCADE');});
async function seed(){
 const actor=randomUUID(),buyer=randomUUID(),product=randomUUID();
 await ctx.db.pool.query("INSERT INTO users(id,role) VALUES($1,'admin'),($2,'customer')",[actor,buyer]);
 await ctx.db.pool.query("INSERT INTO products(id,sku,name) VALUES($1,'A','New product name')",[product]);
 const add=async(status:string,payment:string,date:string,refused=0)=>{
  const checkout=randomUUID(),id=randomUUID();
  await ctx.db.pool.query("INSERT INTO checkout_sessions(id,user_id,status,snapshot,expires_at) VALUES($1,$2,'placed','{}',now())",[checkout,buyer]);
  await ctx.db.pool.query("INSERT INTO orders(id,public_number,checkout_id,user_id,status,payment_status,delivery_status,currency,subtotal_minor,delivery_minor,total_minor,customer_snapshot,delivery_snapshot,consent_snapshot,created_at) VALUES($1::uuid,$1::uuid::text,$2,$3,$4,$5,'not_created','RUB',10001,1000,11001,'{}','{}','{}',$6)",[id,checkout,buyer,status,payment,date]);
  await ctx.db.pool.query("INSERT INTO order_items(order_id,product_id,sku,name_snapshot,quantity,unit_minor,line_minor,refused_count) VALUES($1,$2,'A','Saved name',1,10001,10001,$3)",[id,product,refused]);
  return id;
 };
 return {actor,buyer,add,service:new AdminStatistics(ctx.db,()=>now)};
}
test('statistics uses Moscow creation dates, fills empty days and excludes cancellation, unpaid and returned sales',async()=>{
 const f=await seed();
 await f.add('placed','paid','2026-08-31T21:00:00Z'); // Sept 1 Moscow, included in seven days
 await f.add('placed','paid','2026-08-31T20:59:59Z'); // excluded
 await f.add('placed','paid','2026-09-07T12:00:01Z'); // future excluded
 await f.add('cancelled','paid','2026-09-07T01:00:00Z');
 await f.add('draft','pending','2026-09-07T02:00:00Z');
 await f.add('completed','paid','2026-09-07T03:00:00Z',1);
 await f.add('completed','partially_refunded','2026-09-07T04:00:00Z');
 const stats=await f.service.get(f.actor,{days:'7'});
 assert.equal(stats.orders,5);assert.equal(stats.paidOrders,1);assert.equal(stats.salesMinor,10001);assert.equal(stats.units,1);assert.equal(stats.cancelled,1);assert.equal(stats.returned,2);
 assert.equal(stats.daily.length,7);assert.deepEqual(stats.daily[0],{date:'2026-09-01',orders:1,salesMinor:10001,units:1});assert.equal(stats.daily[1].orders,0);
 assert.deepEqual(stats.topProducts,[{sku:'A',name:'Saved name',units:1,salesMinor:10001}]);
 await assert.rejects(f.service.get(f.buyer,{}),/FORBIDDEN/);await assert.rejects(f.service.get(f.actor,{days:'365'}));
 await ctx.db.pool.query('UPDATE users SET disabled=true WHERE id=$1',[f.actor]);await assert.rejects(f.service.get(f.actor,{}),/FORBIDDEN/);
});
test('statistics excludes successful refunds even before order status sync; empty periods return zeros',async()=>{
 const f=await seed();assert.equal((await f.service.get(f.actor,{days:'90'})).salesMinor,0);
 const id=await f.add('placed','paid','2026-09-07T01:00:00Z'),payment=randomUUID();
 await ctx.db.pool.query("INSERT INTO payments(id,order_id,provider,account_id,environment,external_id,status,amount_minor,currency) VALUES($1,$2,'test','test','test','test','paid',11001,'RUB')",[payment,id]);
 await ctx.db.pool.query("INSERT INTO refunds(id,payment_id,idempotency_key,amount_minor,status) VALUES($1,$2,'refund',1000,'pending')",[randomUUID(),payment]);
 assert.equal((await f.service.get(f.actor,{})).salesMinor,10001);
 await ctx.db.pool.query("UPDATE refunds SET status='succeeded'");const stats=await f.service.get(f.actor,{});assert.equal(stats.salesMinor,0);assert.equal(stats.returned,1);
 const app=await buildApp({db:ctx.db,otpSecret:'s'.repeat(32),staffSecret:'s'.repeat(32),otpSender:new DisabledOtpSender(),origin:'http://127.0.0.1:3200',secureCookies:false});
 try{const r=await app.inject({url:'/api/admin/v1/statistics'});assert.equal(r.statusCode,401);assert.equal(r.headers['cache-control'],'no-store');assert.ok(!r.body.includes('Saved name'));}finally{await app.close();}
});
