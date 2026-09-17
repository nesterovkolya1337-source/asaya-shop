import {before,after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {testDatabase} from './postgres.js';
import {AnalyticsReport,analyticsPeriod} from '../src/analytics-report.js';
import {ProductAnalytics} from '../src/product-analytics.js';
import {buildApp} from '../src/app.js';
import {DisabledOtpSender} from '../src/auth.js';
let ctx:Awaited<ReturnType<typeof testDatabase>>;
const now=new Date('2026-09-17T12:00:00Z');
before(async()=>{ctx=await testDatabase();});after(async()=>{await ctx?.stop();});
beforeEach(async()=>{await ctx.db.pool.query('TRUNCATE products,warehouses,users,checkout_sessions CASCADE');});
async function seed(){
 const admin=randomUUID(),buyer=randomUUID(),A=randomUUID(),B=randomUUID();
 await ctx.db.pool.query("INSERT INTO users(id,role) VALUES($1,'admin'),($2,'customer')",[admin,buyer]);
 for(const [id,sku,name,category] of [[A,'A','Шампунь','hair'],[B,'B','Крем','body']]){
  await ctx.db.pool.query('INSERT INTO products(id,sku,name,active) VALUES($1,$2,$3,true)',[id,sku,name]);
  const draft={name,content:{category}};
  await ctx.db.pool.query('INSERT INTO product_editor(product_id,revision,draft,published) VALUES($1,1,$2,$2)',[id,JSON.stringify(draft)]);
 }
 const order=async(items:Array<[string,number,number,number?]>,status='placed',payment='paid',at='2026-09-12T10:00:00Z')=>{
  const id=randomUUID(),checkout=randomUUID(),subtotal=items.reduce((n,[,q,p])=>n+q*p,0);
  await ctx.db.pool.query("INSERT INTO checkout_sessions(id,user_id,status,snapshot,expires_at) VALUES($1,$2,'placed','{}',now())",[checkout,buyer]);
  await ctx.db.pool.query("INSERT INTO orders(id,public_number,checkout_id,user_id,status,payment_status,delivery_status,currency,subtotal_minor,delivery_minor,total_minor,customer_snapshot,delivery_snapshot,consent_snapshot,created_at) VALUES($1::uuid,$1::uuid::text,$2,$3,$4,$5,'not_created','RUB',$6::bigint,1000,$6::bigint+1000,'{}','{}','{}',$7)",[id,checkout,buyer,status,payment,subtotal,at]);
  for(const [sku,quantity,price,refused=0] of items)await ctx.db.pool.query('INSERT INTO order_items(order_id,product_id,sku,name_snapshot,quantity,unit_minor,line_minor,refused_count) VALUES($1,$2,$3,$4,$5,$6,$5::int*$6::bigint,$7)',[id,sku==='A'?A:B,sku,sku==='A'?'Шампунь':'Крем',quantity,price,refused]);
  return id;
 };
 const refund=async(order:string,amount:number,status='succeeded')=>{
  const pay=randomUUID(),id=randomUUID();
  await ctx.db.pool.query("INSERT INTO payments(id,order_id,provider,account_id,environment,external_id,status,amount_minor,currency) VALUES($1,$2,'test','test','test',$1::uuid::text,'paid',200000,'RUB')",[pay,order]);
  await ctx.db.pool.query('INSERT INTO refunds(id,payment_id,idempotency_key,amount_minor,status) VALUES($1,$2,$1::uuid::text,$3,$4)',[id,pay,amount,status]);
  return id;
 };
 return {admin,buyer,A,B,order,refund,report:new AnalyticsReport(ctx.db,()=>now),collector:new ProductAnalytics(ctx.db)};
}
test('analytics reconciles money, mixed baskets, partial/full refunds and session funnels without counting delivery as sales',async()=>{
 const f=await seed();
 await f.order([['A',2,10000],['B',1,30000]]);
 await f.order([['A',1,10000]],'draft','pending');
 await f.order([['B',1,30000]],'cancelled','cancelled');
 const partial=await f.order([['A',3,10000,1]],'completed');await f.refund(partial,5000);
 const full=await f.order([['B',2,30000,2]],'completed','refunded');await f.refund(full,61000);
 const payload={anonymousSessionId:randomUUID(),events:['product_impression','product_open','product_click','add_to_cart','checkout_started'].map(type=>({eventId:randomUUID(),type,sku:'A'}))};
 await Promise.all([f.collector.ingest(payload),f.collector.ingest(payload),f.collector.ingest(payload)]);
 await f.collector.ingest({anonymousSessionId:randomUUID(),events:[{eventId:randomUUID(),type:'product_impression',sku:'A'},{eventId:randomUUID(),type:'product_open',sku:'A'},{eventId:randomUUID(),type:'product_impression',sku:'B'}]});
 await ctx.db.pool.query('UPDATE product_analytics_events SET occurred_at=$1',[now]);
 const r=await f.report.get(f.admin,{days:'7'}),s=r.summary;
 assert.equal(s.orders,5);assert.equal(s.paidOrders,3);assert.equal(s.salesMinor,140000);assert.equal(s.units,8);assert.equal(s.cancelled,1);assert.equal(s.returnedUnits,3);assert.equal(s.returnedMinor,null);assert.equal(s.aovMinor,46667);
 assert.equal(s.impressions,3);assert.equal(s.opens,2);assert.equal(s.adds,1);assert.equal(s.checkouts,1);
 assert.equal(r.quality.confirmedRefundMinor,66000);assert.equal(r.quality.refundAllocationIncomplete,true);
 const a=r.products.find(p=>p.sku==='A')!,b=r.products.find(p=>p.sku==='B')!;
 assert.equal(a.salesMinor,50000);assert.equal(a.units,5);assert.equal(a.orders,3);assert.equal(a.paidOrders,2);assert.equal(a.ctr,50);assert.equal(a.addRate,50);assert.equal(a.paidConversion,100);assert.equal(a.averagePriceMinor,10000);
 assert.equal(b.returnedMinor,60000);assert.equal(b.returnedUnits,2);assert.equal(b.salesMinor,90000);
 assert.equal(r.daily.reduce((n,d)=>n+d.salesMinor,0),s.salesMinor);assert.equal(r.daily.length,7);
 assert.deepEqual(await f.report.get(f.admin,{days:'7'}),r);
 const filtered=await f.report.get(f.admin,{from:'2026-09-11',to:'2026-09-17',category:'hair',search:'ШАМ'});
 assert.equal(filtered.products.length,1);assert.equal(filtered.summary.orders,3);assert.equal(filtered.summary.salesMinor,50000);
 assert.equal((await f.report.get(f.admin,{days:'7',sku:'B'})).summary.salesMinor,90000);
});
test('backend events are transactional, idempotent and distinguish refunds from cancellation',async()=>{
 const f=await seed(),id=await f.order([['A',1,10000]],'draft','pending');
 await assert.rejects(ctx.db.transaction(async tx=>{await tx.query("UPDATE orders SET payment_status='paid' WHERE id=$1",[id]);throw Error('rollback');}));
 assert.equal((await ctx.db.pool.query("SELECT 1 FROM order_analytics_events WHERE event_type='order_paid'")).rowCount,0);
 await ctx.db.pool.query("UPDATE orders SET payment_status='paid',status='placed' WHERE id=$1",[id]);
 await ctx.db.pool.query("UPDATE orders SET payment_status='paid',status='placed' WHERE id=$1",[id]);
 await ctx.db.pool.query("UPDATE orders SET status='cancelled' WHERE id=$1",[id]);
 const refund=await f.refund(id,11000,'pending');
 assert.equal((await ctx.db.pool.query("SELECT 1 FROM order_analytics_events WHERE event_type='refund_completed'")).rowCount,0);
 await ctx.db.pool.query("UPDATE refunds SET status='succeeded' WHERE id=$1",[refund]);await ctx.db.pool.query("UPDATE refunds SET status='succeeded' WHERE id=$1",[refund]);
 const events=(await ctx.db.pool.query('SELECT event_type,count(*)::int n FROM order_analytics_events GROUP BY event_type ORDER BY event_type')).rows;
 assert.deepEqual(events,[{event_type:'order_cancelled',n:1},{event_type:'order_created',n:1},{event_type:'order_paid',n:1},{event_type:'refund_completed',n:1}]);
 const result=await f.report.get(f.admin,{});assert.equal(result.summary.paidOrders,1);assert.equal(result.summary.cancelled,1);assert.equal(result.summary.returnedUnits,0);
});

test('migration preserves legacy orders and amounts, recovers paid history and leaves unknown categories unknown',async()=>{
 const f=await seed(),id=await f.order([['A',2,12345]],'cancelled','cancelled');
 await f.refund(id,1000);
 await ctx.db.pool.query("INSERT INTO order_status_history(id,order_id,kind,status,source) VALUES($1,$2,'payment','paid','test')",[randomUUID(),id]);
 const before=(await ctx.db.pool.query('SELECT row_to_json(o) data FROM orders o')).rows;
 const sql=await readFile(new URL('../../migrations/027_product_analytics.sql',import.meta.url),'utf8');
 // Reconstruct the pre-027 schema only inside this disposable test database.
 await ctx.db.transaction(async tx=>{
  await tx.query('DROP FUNCTION asaya_analytics_order_event() CASCADE; DROP FUNCTION asaya_analytics_refund_event() CASCADE; DROP FUNCTION asaya_analytics_item_category() CASCADE; DROP TABLE order_analytics_events,product_analytics_events; ALTER TABLE order_items DROP COLUMN category_snapshot');
  await tx.query(sql);
 });
 assert.deepEqual((await ctx.db.pool.query('SELECT row_to_json(o) data FROM orders o')).rows,before);
 assert.equal((await ctx.db.pool.query('SELECT line_minor FROM order_items')).rows[0].line_minor,'24690');
 assert.equal((await ctx.db.pool.query("SELECT count(*)::int n FROM order_analytics_events WHERE historical")).rows[0].n,4);
 const r=await f.report.get(f.admin,{days:'7'});assert.equal(r.summary.salesMinor,24690);assert.equal(r.summary.paidOrders,1);assert.equal(r.summary.returnedMinor,null);assert.equal(r.quality.unknownCategory,true);
 assert.equal((await f.report.get(f.admin,{days:'7',category:'unknown'})).summary.orders,1);
});

test('catalog edits and product removal cannot rewrite historical analytics snapshots',async()=>{
 const f=await seed();await f.order([['A',1,10000]]);
 await f.collector.ingest({anonymousSessionId:randomUUID(),events:[{eventId:randomUUID(),type:'product_open',sku:'B'}]});
 await ctx.db.pool.query("UPDATE product_editor SET published=jsonb_set(published,'{content,category}','\"face\"') WHERE product_id=$1",[f.A]);
 await ctx.db.pool.query('DELETE FROM product_editor WHERE product_id=$1',[f.B]);await ctx.db.pool.query('DELETE FROM products WHERE id=$1',[f.B]);
 await ctx.db.pool.query('UPDATE product_analytics_events SET occurred_at=$1',[now]);
 const r=await f.report.get(f.admin,{days:'7'});assert.equal(r.products.find(p=>p.sku==='A')!.category,'hair');assert.equal(r.products.find(p=>p.sku==='B')!.name,'Крем');
 assert.equal((await ctx.db.pool.query('SELECT product_id FROM product_analytics_events')).rows[0].product_id,null);
});
test('Moscow boundaries, explicit dates, unknown histories and empty denominators are honest',async()=>{
 const f=await seed();
 await f.order([['A',1,10000]],'placed','paid','2026-09-10T21:00:00Z');
 await f.order([['A',1,10000]],'placed','paid','2026-09-10T20:59:59Z');
 await f.order([['A',1,10000]],'placed','paid','2026-09-17T12:00:01Z');
 const r=await f.report.get(f.admin,{days:'7'});assert.equal(r.summary.orders,1);assert.equal(r.daily[0]!.orders,1);assert.equal(r.summary.ctr,null);
 await ctx.db.pool.query("UPDATE orders SET payment_status='refunded' WHERE created_at='2026-09-10T21:00:00Z'");
 const next=await f.report.get(f.admin,{days:'7'});assert.equal(next.quality.unknownRefundOrders,1);assert.equal(next.summary.returnedMinor,null);
 for(const query of [{from:'2026-02-30',to:'2026-03-01'},{from:'2026-09-17'},{from:'2026-09-17',to:'2026-09-16'},{from:'2020-01-01',to:'2026-09-17'},{days:'7',from:'2026-09-01',to:'2026-09-17'},{to:'2027-01-01',from:'2026-09-01'}])assert.throws(()=>analyticsPeriod(query,now));
 await assert.rejects(f.report.get(f.buyer,{}),/FORBIDDEN/);await ctx.db.pool.query('UPDATE users SET disabled=true WHERE id=$1',[f.admin]);await assert.rejects(f.report.get(f.admin,{}),/FORBIDDEN/);
});
test('collector only accepts typed anonymous events for published SKUs, never payment events or PII',async()=>{
 const f=await seed(),session=randomUUID(),event={eventId:randomUUID(),type:'product_impression',sku:'A'};
 await f.collector.ingest({anonymousSessionId:session,events:[event]});
 await f.collector.ingest({anonymousSessionId:session,events:[{...event,eventId:randomUUID()}]});
 await f.collector.ingest({anonymousSessionId:randomUUID(),events:[{...event,eventId:randomUUID(),sku:'unknown'}]});
 for(const extra of [{phone:'+79000000000'},{ip:'127.0.0.1'},{name:'Person'},{url:'https://example.test/account?secret=x'}])await assert.rejects(f.collector.ingest({anonymousSessionId:session,events:[{...event,...extra}]}));
 await assert.rejects(f.collector.ingest({anonymousSessionId:session,events:[{...event,type:'order_paid'}]}));
 await ctx.db.pool.query('UPDATE products SET active=false WHERE id=$1',[f.B]);
 await f.collector.ingest({anonymousSessionId:session,events:[{...event,eventId:randomUUID(),sku:'B'}]});
 const rows=(await ctx.db.pool.query('SELECT * FROM product_analytics_events')).rows;assert.equal(rows.length,1);
 assert.deepEqual(Object.keys(rows[0]).sort(),['anonymous_session_id','category','event_id','event_type','occurred_at','product_id','product_name','sku']);
});
test('HTTP collector preserves Origin and checkout gates; reports require a staff session and are uncached',async()=>{
 await seed();const app=await buildApp({db:ctx.db,otpSecret:'s'.repeat(32),staffSecret:'t'.repeat(32),otpSender:new DisabledOtpSender(),origin:'http://127.0.0.1:3200',secureCookies:false,deploymentMode:'catalog',logger:true});
 const records:Array<Record<string,unknown>>=[];
 app.addHook('onRequest',async req=>{req.log.info=((fields:Record<string,unknown>)=>{records.push(fields);}) as typeof req.log.info;});
 const body={anonymousSessionId:randomUUID(),events:[{eventId:randomUUID(),type:'product_open',sku:'A'}]};
 try{
  const auth=await app.inject({url:'/api/admin/v1/analytics'});assert.equal(auth.statusCode,401);assert.equal(auth.headers['cache-control'],'no-store');
  const rejected=await app.inject({method:'POST',url:'/api/store/v1/analytics/events',payload:body});assert.equal(rejected.statusCode,403);
  const accepted=await app.inject({method:'POST',url:'/api/store/v1/analytics/events',headers:{origin:'http://127.0.0.1:3200'},payload:body});assert.equal(accepted.statusCode,200);assert.deepEqual(accepted.json(),{ok:true});
  const privateInput=await app.inject({method:'POST',url:'/api/store/v1/analytics/events',remoteAddress:'192.0.2.123',headers:{origin:'http://127.0.0.1:3200',cookie:'session=PRIVATE_COOKIE',referer:'https://example.test/?phone=PRIVATE_PHONE'},payload:{...body,phone:'PRIVATE_PHONE'}});assert.equal(privateInput.statusCode,400);
  for(let i=0;i<100&&!records.some(r=>r.requestId===privateInput.headers['x-request-id']);i++)await new Promise(r=>setTimeout(r,10));
  assert.ok(records.some(r=>r.requestId===accepted.headers['x-request-id']));assert.ok(records.some(r=>r.requestId===privateInput.headers['x-request-id']));
  const output=JSON.stringify(records);
  for(const value of ['PRIVATE_PHONE','PRIVATE_COOKIE','192.0.2.123',body.anonymousSessionId,body.events[0]!.eventId])assert.ok(!output.includes(value));
  const gated=await app.inject({method:'POST',url:'/api/store/v1/checkouts',headers:{origin:'http://127.0.0.1:3200'},payload:{}});assert.equal(gated.statusCode,503);
 }finally{await app.close();}
});
