import {before,after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {testDatabase} from './postgres.js';
import {Loyalty,loyaltyAmounts,snapshotLoyalty,earnLoyalty} from '../src/loyalty.js';
let ctx:Awaited<ReturnType<typeof testDatabase>>;
before(async()=>{ctx=await testDatabase();});after(async()=>ctx?.stop());
beforeEach(async()=>ctx.db.pool.query('TRUNCATE users,customer_profiles,products CASCADE'));
test('whole-point rounding, 3% after redemption, 20% cap and balance cap',()=>{
 assert.equal(loyaltyAmounts(100000,1000,0).cashbackPoints,30);
 assert.deepEqual(loyaltyAmounts(100000,1000,200),{maximum:200,redeemedPoints:200,cashProductMinor:80000,cashbackPoints:24});
 assert.equal(loyaltyAmounts(99999,1000,0).cashbackPoints,29);
 assert.equal(loyaltyAmounts(100000,50,50).maximum,50);
 assert.throws(()=>loyaltyAmounts(100000,1000,201),/LOYALTY_LIMIT/);
 assert.throws(()=>loyaltyAmounts(100000,50,51),/LOYALTY_LIMIT/);
 assert.throws(()=>loyaltyAmounts(100000,50,1.5),/INVALID_AMOUNT/);
});
async function fixture(redeemed=0){
 const db=ctx.db,user=randomUUID(),checkout=randomUUID(),order=randomUUID(),payment=randomUUID();
 await db.pool.query('INSERT INTO users(id) VALUES($1)',[user]);
 await db.pool.query("INSERT INTO user_identities(channel,destination,user_id,verified_at) VALUES('sms','+79990000000',$1,now())",[user]);
 const customer=(await db.pool.query("INSERT INTO customer_profiles(phone,user_id) VALUES('+79990000000',$1) RETURNING id",[user])).rows[0].id;
 await db.pool.query("INSERT INTO checkout_sessions(id,user_id,status,snapshot,expires_at) VALUES($1,$2,'placed','{}',now()+interval '1 hour')",[checkout,user]);
 await db.pool.query(`INSERT INTO orders(id,public_number,checkout_id,user_id,customer_id,status,payment_status,delivery_status,currency,subtotal_minor,delivery_minor,total_minor,customer_snapshot,delivery_snapshot,consent_snapshot)
 VALUES($1,'ASAYA-LOYALTY',$2,$3,$4,'placed','paid','not_created','RUB',100000,30000,130000,'{}','{}','{}')`,[order,checkout,user,customer]);
 await db.pool.query("INSERT INTO payments(id,order_id,provider,account_id,environment,external_id,status,amount_minor,currency) VALUES($1,$2,'ycp','test','test','paid','paid',130000,'RUB')",[payment,order]);
 if(!redeemed)await db.transaction(tx=>snapshotLoyalty(tx,order,100000));
 else {
  // Isolated historical snapshot, not a claim that checkout redemption is wired.
  await db.pool.query('INSERT INTO loyalty_order_snapshots(order_id,eligible_minor,redeemed_points,cash_product_minor,cashback_percent,max_redemption_percent) VALUES($1,100000,$2,$3,3,20)',[order,redeemed,100000-redeemed*100]);
  await db.pool.query("INSERT INTO loyalty_ledger(id,customer_id,type,points,source,source_key,description) VALUES($1,$2,'admin_adjustment',300,'isolated_fixture','opening','Fixture opening'),($3,$2,'redemption',$4,'isolated_fixture','redemption','Fixture redemption')",[randomUUID(),customer,randomUUID(),-redeemed]);
 }
 return {db,user,order,payment,customer,service:new Loyalty(db)};
}
test('cashback ignores delivery, concurrent retries credit once; immutable history and settings snapshot',async()=>{
 const f=await fixture();
 await f.db.pool.query("UPDATE marketing_settings SET live=jsonb_set(live,'{loyalty,cashbackPercent}','9')");
 await Promise.all(Array.from({length:8},()=>f.db.transaction(tx=>earnLoyalty(tx,f.order))));
 const view=await f.service.account(f.user);assert.equal(view.balance,30);assert.equal(view.history.length,1);assert.equal(view.history[0].orderNumber,'ASAYA-LOYALTY');assert.equal(view.redemptionAvailable,false);
 assert.ok(!JSON.stringify(view).includes(f.customer));assert.ok(!JSON.stringify(view).includes(f.order));
 await assert.rejects(f.service.account(randomUUID()),/UNAUTHENTICATED/);
 await assert.rejects(f.db.pool.query('UPDATE loyalty_ledger SET points=100'),/immutable/);
 await assert.rejects(f.db.pool.query('DELETE FROM loyalty_ledger'),/immutable/);
 await assert.rejects(f.db.pool.query('UPDATE loyalty_order_snapshots SET cashback_percent=9'),/immutable/);
 await f.db.pool.query("UPDATE marketing_settings SET live=jsonb_set(live,'{loyalty,cashbackPercent}','3')");
});

test('partial refunds restore historical redeemed points proportionally; full refund restores remainder once',async()=>{
 const f=await fixture(200);await f.db.transaction(tx=>earnLoyalty(tx,f.order));
 assert.equal((await f.service.account(f.user)).balance,124);
 const refund=async()=>{const id=randomUUID();await f.db.pool.query("INSERT INTO refunds(id,payment_id,idempotency_key,amount_minor,status) VALUES($1::uuid,$2,$1::text,40000,'succeeded')",[id,f.payment]);return id;};
 const a=await refund();await f.service.refund(a,40000);assert.equal((await f.service.account(f.user)).balance,212);
 const b=await refund();await f.service.refund(b,40000);await f.service.refund(b,40000);assert.equal((await f.service.account(f.user)).balance,300);
});
test('confirmed partial/full refunds append corrections once and never infer a delivery return as money',async()=>{
 const f=await fixture();await f.db.transaction(tx=>earnLoyalty(tx,f.order));
 const refund=async(amount:number,status='succeeded')=>{const id=randomUUID();await f.db.pool.query('INSERT INTO refunds(id,payment_id,idempotency_key,amount_minor,status) VALUES($1::uuid,$2,$1::text,$3,$4)',[id,f.payment,amount,status]);return id;};
 const pending=await refund(10000,'pending');await assert.rejects(f.service.refund(pending,10000),/REFUND_NOT_CONFIRMED/);
 const partial=await refund(50000);await Promise.all([f.service.refund(partial,50000),f.service.refund(partial,50000)]);assert.equal((await f.service.account(f.user)).balance,15);
 await assert.rejects(f.service.refund(partial,40000),/ALLOCATION_CONFLICT/);
 const rest=await refund(80000);await f.service.refund(rest,50000);assert.equal((await f.service.account(f.user)).balance,0);
 assert.equal((await f.service.account(f.user)).history.length,3);
});
test('spent cashback reversal caps at available balance and records shortfall for review without debt',async()=>{
 const f=await fixture();await f.db.transaction(tx=>earnLoyalty(tx,f.order));
 await f.db.pool.query("INSERT INTO loyalty_ledger(id,customer_id,type,points,source,source_key,description) VALUES($1,$2,'redemption',-25,'isolated_fixture','spent','Fixture spend')",[randomUUID(),f.customer]);
 const refund=randomUUID();await f.db.pool.query("INSERT INTO refunds(id,payment_id,idempotency_key,amount_minor,status) VALUES($1::uuid,$2,$1::text,130000,'succeeded')",[refund,f.payment]);
 await f.service.refund(refund,100000);assert.equal((await f.service.account(f.user)).balance,0);
 const reversal=(await f.db.pool.query("SELECT * FROM loyalty_ledger WHERE type='refund_reversal'")).rows[0];assert.equal(reversal.status,'review');assert.equal(reversal.detail.unrecoveredPoints,25);
 await f.service.refund(refund,100000);assert.equal((await f.service.account(f.user)).balance,0);
});
