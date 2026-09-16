import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {Database,type Tx} from './db.js';
import {canonical,hash,DomainError,money} from './core.js';
import {normalizeCustomerPhone} from './customer-phone.js';
import {fulfillmentSnapshotSchema,type FulfillmentSnapshot,type FulfillmentOrder} from './cdek-fulfillment.js';
export interface FulfillmentGateway{find(key:string):Promise<FulfillmentOrder|null>;get(id:number,key:string):Promise<FulfillmentOrder>;create(snapshot:FulfillmentSnapshot):Promise<FulfillmentOrder>;servicePoint(code:string):Promise<number>}
const positive=z.number().int().positive().safe();
const bindingSchema=z.object({enabled:z.literal(true),environment:z.enum(['test','production']),ycpAccountId:z.string().min(1).max(100),deliveryAccountId:z.string().min(1).max(100),warehouseId:z.uuid(),shopId:positive,ffWarehouseId:positive,senderId:positive,pickupRateId:positive.optional(),courierRateId:positive.optional(),ycpWaybillsDisabled:z.boolean(),contractVerified:z.boolean()}).strict();
export type FulfillmentBinding=z.infer<typeof bindingSchema>;
export class FulfillmentDispatch{
 private binding:FulfillmentBinding;
 constructor(private db:Database,private api:FulfillmentGateway,binding:FulfillmentBinding,private clock=()=>new Date()){
  this.binding=bindingSchema.parse(binding);
  if(binding.environment==='production'&&(!binding.ycpWaybillsDisabled||!binding.contractVerified||binding.shopId===217484||binding.ffWarehouseId===7460||binding.senderId===9704))throw new DomainError('FULFILLMENT_PRODUCTION_NOT_READY');
 }
 private async paid(tx:Tx,id:string){
  const b=this.binding;
  const o=(await tx.query(`SELECT o.* FROM orders o JOIN ycp_sessions y ON y.order_id=o.id
   WHERE o.id=$1 AND y.account_id=$2 AND y.environment=$3 AND y.placement_outcome='placed' AND y.payment_method='online'
   AND o.payment_status='paid' AND o.status IN ('placed','processing')
   AND EXISTS(SELECT 1 FROM payments p WHERE p.order_id=o.id AND p.provider='ycp' AND p.account_id=$2 AND p.environment=$3 AND p.status='paid' AND p.amount_minor=o.total_minor AND p.currency=o.currency)
   FOR UPDATE OF o`,[id,b.ycpAccountId,b.environment])).rows[0];
  if(!o)throw new DomainError('FULFILLMENT_PAYMENT_NOT_CONFIRMED');return o;
 }
 private checkBinding(job:any){const b=this.binding;if(job.account_id!==b.ycpAccountId||job.environment!==b.environment||Number(job.shop_id)!==b.shopId||Number(job.warehouse_id)!==b.ffWarehouseId||Number(job.sender_id)!==b.senderId)throw new DomainError('FULFILLMENT_BINDING_CHANGED');}
 async prepare(orderId:string){
  z.uuid().parse(orderId);const b=this.binding;
  const draft=await this.db.transaction(async tx=>{
   const o=await this.paid(tx,orderId),prior=(await tx.query('SELECT * FROM fulfillment_jobs WHERE order_id=$1',[orderId])).rows[0];
   if(prior){this.checkBinding(prior);return {existing:true as const};}
   if((await tx.query('SELECT 1 FROM shipments WHERE order_id=$1 UNION ALL SELECT 1 FROM order_dispatch WHERE order_id=$1',[orderId])).rowCount)throw new DomainError('FULFILLMENT_SHIPMENT_ALREADY_EXISTS');
   const lines=(await tx.query(`SELECT i.*,ARRAY(SELECT x.external_id FROM product_external_ids x WHERE x.product_id=i.product_id AND x.provider='cdek_ff' AND x.account_id=$2 AND x.environment=$3) offer_ids,
    COALESCE((SELECT sum(r.quantity) FROM inventory_reservations r WHERE r.order_id=i.order_id AND r.product_id=i.product_id AND r.warehouse_id=$4 AND r.status='active'),0)::integer reserved
    FROM order_items i WHERE i.order_id=$1 ORDER BY i.sku`,[orderId,String(b.shopId),b.environment,b.warehouseId])).rows;
   if(!lines.length||lines.some(i=>i.reserved!==i.quantity||i.offer_ids.length!==1||!/^\d+$/.test(i.offer_ids[0])))throw new DomainError('FULFILLMENT_PRODUCT_MAPPING_REQUIRED');
   const d=o.delivery_snapshot?.ycp;
   if(!d||d.service_type!=='cdek'||!['pickup_point','courier'].includes(d.delivery_method))throw new DomainError('FULFILLMENT_DELIVERY_UNSUPPORTED');
   const rateId=d.delivery_method==='pickup_point'?b.pickupRateId:b.courierRateId;
   if(!rateId)throw new DomainError('FULFILLMENT_RATE_MAPPING_REQUIRED');
   return {existing:false as const,phone:normalizeCustomerPhone(o.customer_snapshot.phone??''),name:o.customer_snapshot.name,email:o.customer_snapshot.email,delivery:d,rateId,
    items:lines.map(i=>({offerId:Number(i.offer_ids[0]),quantity:i.quantity,unitMinor:money(i.unit_minor)})),externalId:(b.environment==='test'?'TEST-':'')+o.public_number};
  });
  if(draft.existing)return;
  const d=draft.delivery;
  const delivery=d.delivery_method==='pickup_point'
   ?{method:'pickup_point' as const,rateId:draft.rateId,servicePointId:await this.api.servicePoint(d.address.pickup_point_id)}
   :{method:'courier' as const,rateId:draft.rateId,address:[d.address.locality,d.address.address,d.address.apartment&&'кв. '+d.address.apartment,d.address.entrance&&'подъезд '+d.address.entrance,d.address.floor&&'этаж '+d.address.floor,d.address.intercom&&'домофон '+d.address.intercom].filter(Boolean).join(', ')};
  const snapshot=fulfillmentSnapshotSchema.parse({externalId:draft.externalId,environment:b.environment,payment:'paid',customer:{name:draft.name,phone:draft.phone,...(draft.email?{email:draft.email}:{})},items:draft.items,delivery});
  await this.db.transaction(async tx=>{
   await this.paid(tx,orderId);
   const prior=(await tx.query('SELECT * FROM fulfillment_jobs WHERE order_id=$1',[orderId])).rows[0];
   if(prior){this.checkBinding(prior);if(prior.request_hash!==hash(canonical(snapshot)))throw new DomainError('FULFILLMENT_SNAPSHOT_CONFLICT');return;}
   // The PVZ lookup happened outside this transaction. A manual dispatch may
   // have completed meanwhile; recheck under the same order lock before claim.
   if((await tx.query('SELECT 1 FROM shipments WHERE order_id=$1 UNION ALL SELECT 1 FROM order_dispatch WHERE order_id=$1',[orderId])).rowCount)throw new DomainError('FULFILLMENT_SHIPMENT_ALREADY_EXISTS');
   const reserves=(await tx.query('SELECT product_id,warehouse_id,status,quantity FROM inventory_reservations WHERE order_id=$1 FOR UPDATE',[orderId])).rows;
   const items=(await tx.query('SELECT product_id,quantity FROM order_items WHERE order_id=$1',[orderId])).rows;
   if(reserves.some(r=>r.status!=='active'||r.warehouse_id!==b.warehouseId||!items.some(i=>i.product_id===r.product_id))||items.some(i=>reserves.filter(r=>r.product_id===i.product_id).reduce((sum,r)=>sum+r.quantity,0)!==i.quantity))throw new DomainError('FULFILLMENT_RESERVATION_CHANGED');
   await tx.query(`INSERT INTO fulfillment_jobs(order_id,account_id,environment,shop_id,warehouse_id,sender_id,external_key,request_snapshot,request_hash,state)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'prepared')`,[orderId,b.ycpAccountId,b.environment,b.shopId,b.ffWarehouseId,b.senderId,snapshot.externalId,JSON.stringify(snapshot),hash(canonical(snapshot))]);
  });
 }
 private async save(tx:Tx,orderId:string,remote:FulfillmentOrder){
  const b=this.binding,at=this.clock();
  const job=(await tx.query('SELECT external_key,external_id FROM fulfillment_jobs WHERE order_id=$1 FOR UPDATE',[orderId])).rows[0];
  const prior=(await tx.query('SELECT * FROM order_logistics WHERE order_id=$1 FOR UPDATE',[orderId])).rows[0];
  if(!job||job.external_key!==remote.externalId||job.external_id!==null&&Number(job.external_id)!==remote.id)throw new DomainError('FULFILLMENT_ORDER_MISMATCH');
  if(prior&&(prior.account_id!==b.deliveryAccountId||prior.environment!==b.environment))throw new DomainError('FULFILLMENT_BINDING_CHANGED');
  if(prior?.tracking_number&&remote.trackingNumber&&prior.tracking_number!==remote.trackingNumber)throw new DomainError('FULFILLMENT_TRACKING_CHANGED');
  await tx.query("UPDATE fulfillment_jobs SET state='created',external_id=$2,verified_at=$3 WHERE order_id=$1",[orderId,remote.id,at]);
  await tx.query(`INSERT INTO order_logistics(order_id,account_id,environment,fulfillment_status,fulfillment_raw_status,fulfillment_synced_at,tracking_number)
   VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(order_id) DO UPDATE SET fulfillment_status=excluded.fulfillment_status,fulfillment_raw_status=excluded.fulfillment_raw_status,fulfillment_synced_at=excluded.fulfillment_synced_at,tracking_number=COALESCE(order_logistics.tracking_number,excluded.tracking_number)`,[orderId,b.deliveryAccountId,b.environment,remote.status,remote.rawStatus,at,remote.trackingNumber]);
  if(prior?.fulfillment_raw_status!==remote.rawStatus)await tx.query(`INSERT INTO order_logistics_events(id,order_id,provider,raw_status,status,occurred_at,observed_at) VALUES($1,$2,'cdek_ff',$3,$4,$5,$5) ON CONFLICT DO NOTHING`,[randomUUID(),orderId,remote.rawStatus,remote.status,at]);
  if(['accepted','assembling','assembled','handed_to_delivery'].includes(remote.status)){
   const changed=await tx.query("UPDATE orders SET status='processing',delivery_status='preparing',updated_at=$2 WHERE id=$1 AND status='placed' AND payment_status='paid' AND delivery_status='not_created' RETURNING id",[orderId,at]);
   if(changed.rowCount)await tx.query("INSERT INTO order_status_history(id,order_id,kind,status,source,occurred_at) VALUES($1,$2,'delivery','preparing','cdek_ff',$3)",[randomUUID(),orderId,at]);
  }
 }
 async submit(orderId:string){
  await this.prepare(orderId);
  const job=(await this.db.pool.query('SELECT * FROM fulfillment_jobs WHERE order_id=$1',[orderId])).rows[0];this.checkBinding(job);
  if(job.state==='created')return {state:'created' as const};
  // Search first. A timed-out POST is never automatically sent again.
  const found=await this.api.find(job.external_key);
  if(found){await this.db.transaction(async tx=>{await tx.query('SELECT id FROM orders WHERE id=$1 FOR UPDATE',[orderId]);await this.save(tx,orderId,found);});return {state:'created' as const};}
  if(job.state!=='prepared'){await this.db.pool.query("UPDATE fulfillment_jobs SET state='uncertain' WHERE order_id=$1 AND state='sending' AND started_at<$2::timestamptz-interval '60 seconds'",[orderId,this.clock()]);return {state:'review' as const};}
  const claimed=await this.db.transaction(async tx=>{await this.paid(tx,orderId);return (await tx.query("UPDATE fulfillment_jobs SET state='sending',started_at=$2 WHERE order_id=$1 AND state='prepared' RETURNING order_id",[orderId,this.clock()])).rowCount===1;});
  if(!claimed)return {state:'review' as const};
  try{
   // Hold the order lock during this single bounded request so a simultaneous
   // cancellation cannot release its reservation while FF accepts the order.
   await this.db.transaction(async tx=>{await this.paid(tx,orderId);await this.save(tx,orderId,await this.api.create(fulfillmentSnapshotSchema.parse(job.request_snapshot)));});
   return {state:'created' as const};
  }catch{
   await this.db.pool.query("UPDATE fulfillment_jobs SET state='uncertain' WHERE order_id=$1 AND state='sending'",[orderId]);
   return {state:'review' as const};
  }
 }
 async reconcile(orderId:string){
  z.uuid().parse(orderId);const job=(await this.db.pool.query('SELECT * FROM fulfillment_jobs WHERE order_id=$1',[orderId])).rows[0];
  if(!job)throw new DomainError('FULFILLMENT_ORDER_NOT_CREATED');this.checkBinding(job);
  const remote=job.external_id?await this.api.get(Number(job.external_id),job.external_key):await this.api.find(job.external_key);
  if(!remote){await this.db.pool.query("UPDATE fulfillment_jobs SET state='uncertain' WHERE order_id=$1 AND state='sending' AND started_at<$2::timestamptz-interval '60 seconds'",[orderId,this.clock()]);return {state:'review' as const};}
  await this.db.transaction(async tx=>{await tx.query('SELECT id FROM orders WHERE id=$1 FOR UPDATE',[orderId]);await this.save(tx,orderId,remote);});
  return {state:'created' as const};
 }
 async sync(orderId:string){
  z.uuid().parse(orderId);const job=(await this.db.pool.query('SELECT * FROM fulfillment_jobs WHERE order_id=$1',[orderId])).rows[0];
  if(!job||job.state!=='created')throw new DomainError('FULFILLMENT_ORDER_NOT_CREATED');this.checkBinding(job);
  const remote=await this.api.get(Number(job.external_id),job.external_key);
  await this.db.transaction(async tx=>{await tx.query('SELECT id FROM orders WHERE id=$1 FOR UPDATE',[orderId]);await this.save(tx,orderId,remote);});
 }
}
