import {randomUUID} from 'node:crypto';
import {Database} from './db.js';
import {z} from 'zod';
export async function purgeUnpaidContacts(db:Database,scope:{accountId:string;environment:'test'|'production'},now=new Date()){
 z.object({accountId:z.string().min(1).max(100),environment:z.enum(['test','production'])}).strict().parse(scope);
 return db.transaction(async tx=>{
  // Only definitive YCP cancellation, never a local timer or an ambiguous timeout.
  const rows=(await tx.query(`SELECT o.id,o.checkout_id FROM orders o JOIN ycp_sessions y ON y.order_id=o.id
   WHERE y.account_id=$1 AND y.environment=$2 AND o.status='cancelled' AND o.payment_status IN ('cancelled','failed')
   AND o.updated_at<=$3::timestamptz-interval '30 days' AND NOT o.legal_hold AND o.pii_purged_at IS NULL
   AND EXISTS(SELECT 1 FROM order_status_history h WHERE h.order_id=o.id AND h.source='ycp' AND h.kind='order' AND h.status='cancelled')
   AND NOT EXISTS(SELECT 1 FROM payments p WHERE p.order_id=o.id)
   AND NOT EXISTS(SELECT 1 FROM fulfillment_jobs j WHERE j.order_id=o.id)
   ORDER BY o.updated_at,o.id LIMIT 100 FOR UPDATE OF o SKIP LOCKED`,[scope.accountId,scope.environment,now])).rows;
  for(const o of rows){
   await tx.query(`UPDATE orders SET customer_snapshot='{"source":"ycp","redacted":true}',delivery_snapshot='{"source":"ycp","redacted":true}',
    customer_phone_normalized=NULL,customer_id=NULL,pii_purged_at=$2 WHERE id=$1`,[o.id,now]);
   await tx.query("UPDATE checkout_sessions SET snapshot=snapshot-'customer'-'delivery' WHERE id=$1",[o.checkout_id]);
   await tx.query("INSERT INTO audit_log(id,action,entity_id,detail) VALUES($1,'order.unpaid_contacts_purged',$2,'{\"policy\":\"unpaid-30-days\"}')",[randomUUID(),o.id]);
  }
  return rows.length;
 });
}
