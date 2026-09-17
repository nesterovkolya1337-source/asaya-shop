import {randomUUID} from 'node:crypto';
import type {z} from 'zod';
import type {Database} from './db.js';
import {canonical,hash,DomainError} from './core.js';
import {cdekWebhookSchema} from './cdek-delivery.js';
import {deliveryStatus} from './cdek-status.js';

// HTTPS callback secret is authenticated by app.ts before this boundary.
// The documented attributes.number is the only first-binding key. No remote calls.
export async function applyCdekPush(db:Database,e:z.infer<typeof cdekWebhookSchema>,scope:{accountId:string;environment:string;ycpAccountId:string},at:Date){
 if(e.attributes.is_return||e.attributes.is_reverse||e.attributes.is_client_return)return;
 await db.transaction(async tx=>{
  const a=e.attributes;
  const order=(await tx.query(`SELECT o.id,o.status,o.delivery_status FROM orders o JOIN ycp_sessions y ON y.order_id=o.id
   WHERE o.public_number=$1 AND y.account_id=$2 AND y.environment=$3 AND y.placement_outcome='placed'
   AND o.status IN ('placed','processing','completed') AND o.delivery_snapshot->'ycp'->>'service_type'='cdek'
   FOR UPDATE OF o`,[a.number??'',scope.ycpAccountId,scope.environment])).rows[0];
  if(!order)return; // Missing or unknown merchant number never imports a shipment.
  const previous=(await tx.query('SELECT * FROM order_logistics WHERE order_id=$1 FOR UPDATE',[order.id])).rows[0];
  if(previous&&(previous.account_id!==scope.accountId||previous.environment!==scope.environment||previous.cdek_uuid&&previous.cdek_uuid!==e.uuid||previous.tracking_number&&previous.tracking_number!==a.cdek_number))throw new DomainError('CDEK_BINDING_CONFLICT',409);
  const eventId=hash(canonical([e.uuid,a.number,a.code,a.status_date_time,a.deleted,e.date_time]));
  if(!(await tx.query(`INSERT INTO integration_inbox(provider,account_id,environment,event_id,payload_hash)
   VALUES('cdek',$1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING event_id`,[scope.accountId,scope.environment,eventId,hash(canonical(e))])).rowCount)return;
  await tx.query(`INSERT INTO order_logistics(order_id,account_id,environment,cdek_uuid,tracking_number)
   VALUES($1,$2,$3,$4,$5) ON CONFLICT(order_id) DO UPDATE SET cdek_uuid=excluded.cdek_uuid,tracking_number=excluded.tracking_number`,[order.id,scope.accountId,scope.environment,e.uuid,a.cdek_number]);
  // observed_at stores provider event time so late corrections cannot resurrect an event.
  await tx.query(`INSERT INTO order_logistics_events(id,order_id,provider,raw_status,status,occurred_at,observed_at,deleted)
   VALUES($1,$2,'cdek',$3,$4,$5,$6,$7) ON CONFLICT(order_id,provider,raw_status,occurred_at)
   DO UPDATE SET deleted=excluded.deleted,observed_at=excluded.observed_at
   WHERE order_logistics_events.observed_at<=excluded.observed_at`,[randomUUID(),order.id,a.code,deliveryStatus(a.code),a.status_date_time,e.date_time,a.deleted]);
  const current=(await tx.query(`SELECT status,raw_status,occurred_at FROM order_logistics_events
   WHERE order_id=$1 AND provider='cdek' AND NOT deleted ORDER BY occurred_at DESC,observed_at DESC,raw_status DESC LIMIT 1`,[order.id])).rows[0];
  await tx.query(`UPDATE order_logistics SET delivery_status=$2,delivery_raw_status=$3,delivery_occurred_at=$4,delivery_synced_at=$5,
   delivery_requested_at=NULL,delivery_next_attempt_at=NULL,delivery_attempts=0 WHERE order_id=$1`,[order.id,current?.status??'review',current?.raw_status??a.code,current?.occurred_at??a.status_date_time,at]);
  const legacy:Record<string,string>={handed_to_cdek:'shipped',in_transit:'shipped',out_for_delivery:'shipped',ready_for_pickup:'arrived_to_pickup_point',delivered:'delivered',returned:'returned'};
  const status=legacy[current?.status];
  if(status){
   const reserves=(await tx.query(`SELECT r.* FROM inventory_reservations r JOIN products p ON p.id=r.product_id
    WHERE r.order_id=$1 ORDER BY p.sku,r.warehouse_id FOR UPDATE OF r`,[order.id])).rows;
   if(reserves.some(r=>r.status==='released'))throw new DomainError('INVENTORY_STATE_REQUIRES_REVIEW');
   for(const r of reserves.filter(r=>r.status==='active')){
    const changed=await tx.query('UPDATE inventory_balances SET on_hand=on_hand-$3,reserved=reserved-$3 WHERE product_id=$1 AND warehouse_id=$2 AND on_hand>=$3 AND reserved>=$3',[r.product_id,r.warehouse_id,r.quantity]);
    if(changed.rowCount!==1)throw new DomainError('INVENTORY_STATE_REQUIRES_REVIEW');
    await tx.query("UPDATE inventory_reservations SET status='consumed' WHERE order_id=$1 AND product_id=$2 AND warehouse_id=$3",[order.id,r.product_id,r.warehouse_id]);
    await tx.query("INSERT INTO inventory_movements(id,order_id,product_id,warehouse_id,kind,quantity) VALUES($1,$2,$3,$4,'ship',$5)",[randomUUID(),order.id,r.product_id,r.warehouse_id,r.quantity]);
   }
   if(order.delivery_status!==status){
    await tx.query('UPDATE orders SET delivery_status=$2,status=$3,updated_at=$4 WHERE id=$1',[order.id,status,status==='delivered'?'completed':'processing',at]);
    await tx.query("INSERT INTO order_status_history(id,order_id,kind,status,source,occurred_at) VALUES($1,$2,'delivery',$3,'cdek',$4)",[randomUUID(),order.id,status,current.occurred_at]);
   }
  }
 });
}
