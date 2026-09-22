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
