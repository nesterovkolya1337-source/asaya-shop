import {earnReferral} from './engagement.js';
import {randomUUID} from 'node:crypto';
import {Database,type Tx} from './db.js';
import {DomainError,money} from './core.js';
import {liveMarketing} from './marketing.js';

export const loyaltyDefaults={cashbackPercent:3,maxRedemptionPercent:20};
// Whole points only. Never award fractional points or include delivery.
export function loyaltyAmounts(productMinor:number,balance:number,requested:number,settings=loyaltyDefaults){
 money(productMinor);money(balance);money(requested);
 const maximum=Math.min(balance,Math.floor(productMinor*settings.maxRedemptionPercent/10000));
 if(requested>maximum)throw new DomainError('LOYALTY_LIMIT_EXCEEDED',409);
 const cashProductMinor=productMinor-requested*100;
 return {maximum,redeemedPoints:requested,cashProductMinor,cashbackPoints:Math.floor(cashProductMinor*settings.cashbackPercent/10000)};
}
async function balance(tx:Tx,customer:string){return Number((await tx.query('SELECT COALESCE(sum(points),0) AS balance FROM loyalty_ledger WHERE customer_id=$1',[customer])).rows[0].balance);}
async function customerLock(tx:Tx,customer:string){
 if(!(await tx.query('SELECT id FROM customer_profiles WHERE id=$1 FOR UPDATE',[customer])).rowCount)throw new DomainError('CUSTOMER_NOT_FOUND',404);
}
// Called during creation, before payment. Historical settings never follow later edits.
export async function snapshotLoyalty(tx:Tx,order:string,productMinor:number){
 const settings=(await liveMarketing(tx)).loyalty??loyaltyDefaults;
 await tx.query(`INSERT INTO loyalty_order_snapshots(order_id,eligible_minor,cash_product_minor,cashback_percent,max_redemption_percent)
  VALUES($1,$2,$2,$3,$4)`,[order,productMinor,settings.cashbackPercent,settings.maxRedemptionPercent]);
}
export async function earnLoyalty(tx:Tx,order:string){
 await earnReferral(tx,order);
 const row=(await tx.query(`SELECT o.customer_id,o.payment_status,o.status,s.* FROM orders o JOIN loyalty_order_snapshots s ON s.order_id=o.id
  WHERE o.id=$1`,[order])).rows[0];
 if(!row?.customer_id||row.payment_status!=='paid'||row.status==='cancelled')return;
 if(!(await tx.query("SELECT 1 FROM payments WHERE order_id=$1 AND status='paid'",[order])).rowCount)return;
 await customerLock(tx,row.customer_id);
 const points=Math.floor(money(row.cash_product_minor)*row.cashback_percent/10000);
 await tx.query(`INSERT INTO loyalty_ledger(id,customer_id,type,points,source,source_key,order_id,description)
  VALUES($1,$2,'purchase_cashback',$3,'confirmed_payment',$4,$5,'Баллы за покупку') ON CONFLICT(source_key) DO NOTHING`,[randomUUID(),row.customer_id,points,'purchase:'+order,order]);
}
export class Loyalty {
 constructor(private db:Database){}
 // Provider refund ingestion is excluded from this release; see a6c9e7b prototype.
 async account(user:string){
  return this.db.transaction(async tx=>{
   const profile=(await tx.query(`SELECT p.id FROM customer_profiles p JOIN users u ON u.id=p.user_id
    JOIN user_identities i ON i.user_id=u.id AND i.channel='sms' AND i.verified_at IS NOT NULL AND i.destination=p.phone
    WHERE u.id=$1 AND u.role='customer' AND NOT u.disabled`,[user])).rows[0];
   if(!profile)throw new DomainError('UNAUTHENTICATED',401);
   await customerLock(tx,profile.id);
   const history=(await tx.query(`SELECT l.created_at AS date,l.points::integer AS points,l.description,l.status,o.public_number AS "orderNumber"
    FROM loyalty_ledger l LEFT JOIN orders o ON o.id=l.order_id WHERE l.customer_id=$1 ORDER BY l.created_at DESC,l.id DESC LIMIT 100`,[profile.id])).rows;
   return {balance:await balance(tx,profile.id),pointRubles:1,history,redemptionAvailable:false};
  });
 }
}
