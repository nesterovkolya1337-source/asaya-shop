import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {Database,type Tx} from './db.js';
import {canonical,hash,equal,DomainError} from './core.js';
import {cdekWebhookSchema,type CdekOrderStatus} from './cdek-delivery.js';
import {customerOrderStatus,customerStatusLabels,type DeliveryStatus,type FulfillmentStatus} from './cdek-status.js';
export interface CdekStatusGateway{order(expected:{trackingNumber:string;uuid?:string}):Promise<CdekOrderStatus>}
export type TrackingScope={accountId:string;environment:'test'|'production'};
export class OrderTracking{
 constructor(private db:Database,private api:CdekStatusGateway,private scope:TrackingScope,private clock=()=>new Date()){
  z.object({accountId:z.string().min(1).max(100),environment:z.enum(['test','production'])}).strict().parse(scope);
 }
 async webhook(raw:unknown){
  const e=cdekWebhookSchema.parse(raw);
  if(e.attributes.is_return||e.attributes.is_reverse||e.attributes.is_client_return)return;
  await this.db.transaction(async tx=>{
   const row=(await tx.query(`SELECT order_id FROM order_logistics WHERE account_id=$1 AND environment=$2 AND tracking_number=$3
    AND (cdek_uuid IS NULL OR cdek_uuid=$4) FOR UPDATE`,[this.scope.accountId,this.scope.environment,e.attributes.cdek_number,e.uuid])).rows[0];
   if(!row)return; // No order existence oracle, and no unknown shipment is imported.
   // A correction of the same status/date is a new hint, not a duplicate.
   const eventId=hash(canonical([e.uuid,e.attributes.code,e.attributes.status_date_time,e.attributes.deleted,e.date_time]));
   const inserted=await tx.query(`INSERT INTO integration_inbox(provider,account_id,environment,event_id,payload_hash)
    VALUES('cdek',$1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING event_id`,[this.scope.accountId,this.scope.environment,eventId,hash(canonical(e))]);
   if(!inserted.rowCount)return;
   // Coalesce bursts. We never trust webhook status/phone/address or assign its UUID.
   await tx.query('UPDATE order_logistics SET delivery_requested_at=$2 WHERE order_id=$1',[row.order_id,this.clock()]);
  });
 }
 async refresh(orderId:string){
  z.uuid().parse(orderId);const at=this.clock();
  const row=(await this.db.pool.query('SELECT tracking_number,cdek_uuid FROM order_logistics WHERE order_id=$1 AND account_id=$2 AND environment=$3',[orderId,this.scope.accountId,this.scope.environment])).rows[0];
  if(!row?.tracking_number)throw new DomainError('SHIPMENT_NOT_FOUND',404);
  const response=await this.api.order({trackingNumber:row.tracking_number,...(row.cdek_uuid?{uuid:row.cdek_uuid}:{})});
  // The API adapter validates this too; keep the boundary safe for injected gateways.
  if(response.trackingNumber!==row.tracking_number||row.cdek_uuid&&response.uuid!==row.cdek_uuid)throw new DomainError('CDEK_ORDER_MISMATCH');
  const current=response.events.filter(e=>!e.deleted).at(-1);if(!current)throw new DomainError('CDEK_STATUS_MISSING');
  await this.db.transaction(async tx=>{
   const order=(await tx.query('SELECT id,status,delivery_status FROM orders WHERE id=$1 FOR UPDATE',[orderId])).rows[0];
   const previous=(await tx.query('SELECT * FROM order_logistics WHERE order_id=$1 AND account_id=$2 AND environment=$3 FOR UPDATE',[orderId,this.scope.accountId,this.scope.environment])).rows[0];
   if(!previous)throw new DomainError('CDEK_ORDER_MISMATCH');
   if(previous.delivery_synced_at&&new Date(previous.delivery_synced_at)>at)return;
   if(previous.tracking_number!==response.trackingNumber||previous.cdek_uuid&&previous.cdek_uuid!==response.uuid)throw new DomainError('CDEK_ORDER_MISMATCH');
   for(const e of response.events)await tx.query(`INSERT INTO order_logistics_events(id,order_id,provider,raw_status,status,occurred_at,observed_at,deleted)
    VALUES($1,$2,'cdek',$3,$4,$5,$6,$7) ON CONFLICT(order_id,provider,raw_status,occurred_at) DO UPDATE SET deleted=excluded.deleted,observed_at=excluded.observed_at`,[randomUUID(),orderId,e.rawStatus,e.status,e.occurredAt,at,e.deleted]);
   await tx.query(`UPDATE order_logistics SET cdek_uuid=$2,delivery_status=$3,delivery_raw_status=$4,delivery_occurred_at=$5,delivery_synced_at=$6,
    delivery_requested_at=CASE WHEN delivery_requested_at<=$6 THEN NULL ELSE delivery_requested_at END,delivery_next_attempt_at=NULL,delivery_attempts=0,
    delivery_pickup_point=$7,delivery_planned_date=$8 WHERE order_id=$1`,[orderId,response.uuid,current.status,current.rawStatus,current.occurredAt,at,response.pickupPoint??null,response.plannedDeliveryDate??null]);
   // Return started is not proof of a completed return; never restock/refund here.
   const legacy:Partial<Record<DeliveryStatus,string>>={handed_to_cdek:'shipped',in_transit:'shipped',out_for_delivery:'shipped',ready_for_pickup:'arrived_to_pickup_point',delivered:'delivered',returned:'returned'};
   const status=legacy[current.status];
   if(status&&order.status!=='cancelled'){
    // Physical acceptance consumes each active reserve exactly once. Later YCP
    // delivery replay sees consumed reserves and cannot subtract stock again.
    const reserves=(await tx.query(`SELECT r.* FROM inventory_reservations r JOIN products p ON p.id=r.product_id
     WHERE r.order_id=$1 ORDER BY p.sku,r.warehouse_id FOR UPDATE OF r`,[orderId])).rows;
    if(reserves.some(r=>r.status==='released'))throw new DomainError('INVENTORY_STATE_REQUIRES_REVIEW');
    for(const r of reserves.filter(r=>r.status==='active')){
     const changed=await tx.query('UPDATE inventory_balances SET on_hand=on_hand-$3,reserved=reserved-$3 WHERE product_id=$1 AND warehouse_id=$2 AND on_hand>=$3 AND reserved>=$3',[r.product_id,r.warehouse_id,r.quantity]);
     if(changed.rowCount!==1)throw new DomainError('INVENTORY_STATE_REQUIRES_REVIEW');
     await tx.query("UPDATE inventory_reservations SET status='consumed' WHERE order_id=$1 AND product_id=$2 AND warehouse_id=$3",[orderId,r.product_id,r.warehouse_id]);
     await tx.query("INSERT INTO inventory_movements(id,order_id,product_id,warehouse_id,kind,quantity) VALUES($1,$2,$3,$4,'ship',$5)",[randomUUID(),orderId,r.product_id,r.warehouse_id,r.quantity]);
    }
    if(order.delivery_status!==status){
     await tx.query("UPDATE orders SET delivery_status=$2,status=$3,updated_at=$4 WHERE id=$1",[orderId,status,status==='delivered'?'completed':'processing',at]);
     await tx.query("INSERT INTO order_status_history(id,order_id,kind,status,source,occurred_at) VALUES($1,$2,'delivery',$3,'cdek',$4)",[randomUUID(),orderId,status,current.occurredAt]);
    }
   }
   // Payment/refund ledger never changes in response to delivery data.
  });
 }
 async requestStale(orderId:string,userId:string){
  await this.db.pool.query(`UPDATE order_logistics l SET delivery_requested_at=$3 FROM orders o WHERE o.id=l.order_id AND o.id=$1 AND o.user_id=$2
   AND l.account_id=$4 AND l.environment=$5 AND l.tracking_number IS NOT NULL AND COALESCE(l.delivery_status,'created') NOT IN ('delivered','cancelled','returned')
   AND (l.delivery_synced_at IS NULL OR l.delivery_synced_at<$3::timestamptz-interval '60 minutes')
   AND (l.delivery_requested_at IS NULL OR l.delivery_requested_at<$3::timestamptz-interval '60 minutes')`,[orderId,userId,this.clock(),this.scope.accountId,this.scope.environment]);
 }
 async due(limit=20){
  z.number().int().min(1).max(100).parse(limit);
  return (await this.db.pool.query(`SELECT order_id FROM order_logistics WHERE account_id=$1 AND environment=$2 AND tracking_number IS NOT NULL
   AND (delivery_next_attempt_at IS NULL OR delivery_next_attempt_at<=$3)
   AND (delivery_requested_at IS NOT NULL OR (COALESCE(delivery_status,'created') NOT IN ('delivered','cancelled','returned') AND (delivery_synced_at IS NULL OR delivery_synced_at<$3::timestamptz-interval '24 hours')))
   ORDER BY COALESCE(delivery_requested_at,delivery_synced_at,'epoch'::timestamptz),order_id LIMIT $4`,[this.scope.accountId,this.scope.environment,this.clock(),limit])).rows.map(r=>String(r.order_id));
 }
 async failed(orderId:string){await this.db.pool.query(`UPDATE order_logistics SET delivery_attempts=LEAST(delivery_attempts+1,8),
  delivery_next_attempt_at=$2::timestamptz+make_interval(secs => CASE WHEN delivery_attempts>=7 THEN 86400 ELSE LEAST(21600,300*power(2,delivery_attempts))::double precision END)
  WHERE order_id=$1 AND account_id=$3 AND environment=$4`,[orderId,this.clock(),this.scope.accountId,this.scope.environment]);}
}
export function authorizeCdekWebhook(value:unknown,secret:string){
 if(secret.length<32||typeof value!=='string'||value.length>256||!equal(hash(value),hash(secret)))throw new DomainError('NOT_FOUND',404);
}
// Called only after the existing order ownership check. No raw provider fields or PII.
export async function trackingProjection(db:Database,order:{id:string;status:string;payment_status:string}){
 const row=(await db.pool.query('SELECT *,delivery_planned_date::text AS planned_date_text FROM order_logistics WHERE order_id=$1',[order.id])).rows[0];if(!row)return undefined;
 const status=customerOrderStatus({payment:order.payment_status,order:order.status,fulfillment:row.fulfillment_status as FulfillmentStatus|null,delivery:row.delivery_status as DeliveryStatus|null});
 const events=(await db.pool.query(`SELECT provider,status,occurred_at FROM order_logistics_events WHERE order_id=$1 AND NOT deleted ORDER BY occurred_at,id LIMIT 500`,[order.id])).rows;
 const history:Array<{status:string;label:string;occurredAt:Date}>=[];
 for(const e of events){const state=customerOrderStatus({payment:'paid',order:'placed',...(e.provider==='cdek'?{delivery:e.status as DeliveryStatus}:{fulfillment:e.status as FulfillmentStatus})});
  if(history.at(-1)?.status!==state)history.push({status:state,label:customerStatusLabels[state],occurredAt:e.occurred_at});}
 return {status,label:customerStatusLabels[status],history,trackingNumber:row.tracking_number??null,updatedAt:row.delivery_synced_at??row.fulfillment_synced_at,
  lastStatusAt:row.delivery_occurred_at??null,pickupPoint:row.delivery_pickup_point??null,
  plannedDeliveryDate:row.planned_date_text??null};
}
