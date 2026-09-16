import {z} from 'zod';
import {Database} from './db.js';
import {CommerceService} from './commerce.js';
import {DomainError,money} from './core.js';
import {reviewKinds} from './admin-integration.js';
export class AdminOrders{
 constructor(private db:Database){}
 private async allowed(actor:string){
  if(!(await this.db.pool.query("SELECT 1 FROM users WHERE id=$1 AND role='admin' AND NOT disabled",[actor])).rowCount)throw new DomainError('FORBIDDEN',403);
 }
 async list(actor:string,raw:unknown){
  await this.allowed(actor);
  const q=z.object({search:z.string().trim().max(100).default(''),status:z.enum(['','draft','placed','processing','completed','cancelled']).default(''),payment:z.enum(['','pending','authorized','paid','failed','cancelled','partially_refunded','refunded']).default(''),delivery:z.enum(['','not_created','preparing','shipped','arrived_to_pickup_point','delivered','cancelled','returned']).default(''),cursor:z.uuid().optional()}).strict().parse(raw);
  if(q.cursor&&!(await this.db.pool.query('SELECT 1 FROM orders WHERE id=$1',[q.cursor])).rowCount)throw new DomainError('INVALID_ORDER_CURSOR',400);
  const pattern='%'+q.search.replace(/[\\%_]/g,'\\$&')+'%';
  const rows=(await this.db.pool.query(`SELECT id,public_number,status,payment_status,delivery_status,currency,total_minor,created_at
   FROM orders WHERE ($1='' OR status=$1) AND (public_number ILIKE $2 OR customer_snapshot->>'name' ILIKE $2 OR customer_snapshot->>'phone' ILIKE $2 OR EXISTS(SELECT 1 FROM order_dispatch d WHERE d.order_id=orders.id AND d.tracking_number ILIKE $2))
   AND ($4='' OR payment_status=$4) AND ($5='' OR delivery_status=$5)
   AND ($3::uuid IS NULL OR (created_at,id)<(SELECT created_at,id FROM orders WHERE id=$3))
   ORDER BY created_at DESC,id DESC LIMIT 21`,[q.status,pattern,q.cursor??null,q.payment,q.delivery])).rows;
  const page=rows.slice(0,20);
  return {items:page.map(r=>({...r,total_minor:money(r.total_minor)})),nextCursor:rows.length>20?page.at(-1)!.id:null};
 }
 async detail(actor:string,id:string){
  await this.allowed(actor);z.uuid().parse(id);
  const o=(await this.db.pool.query('SELECT user_id,customer_snapshot,delivery_snapshot FROM orders WHERE id=$1',[id])).rows[0];
  if(!o)throw new DomainError('ORDER_NOT_FOUND',404);
  const order=await new CommerceService(this.db).order(o.user_id,id);
  const reviewSignals=(await this.db.pool.query(`SELECT kind,min(created_at) AS created_at FROM integration_outbox
   WHERE aggregate_id=$1 AND kind=ANY($2::text[]) GROUP BY kind ORDER BY min(created_at),kind`,[id,
   reviewKinds])).rows
   .map(r=>({kind:r.kind,createdAt:r.created_at}));
  const packed=(await this.db.pool.query('SELECT packed_by,packed_at FROM order_packing WHERE order_id=$1',[id])).rows[0];
  const dispatched=(await this.db.pool.query('SELECT carrier,tracking_number,dispatched_by,dispatched_at FROM order_dispatch WHERE order_id=$1',[id])).rows[0];
  const dispatch=dispatched?{carrier:dispatched.carrier,trackingNumber:dispatched.tracking_number,dispatchedBy:dispatched.dispatched_by,dispatchedAt:dispatched.dispatched_at}:null;
  const completed=(await this.db.pool.query('SELECT completed_by,completed_at,reason FROM order_completion WHERE order_id=$1',[id])).rows[0];
  const completion=completed?{completedBy:completed.completed_by,completedAt:completed.completed_at,reason:completed.reason}:null;
  const ff=(await this.db.pool.query(`SELECT j.state,j.external_id,j.external_key,l.fulfillment_raw_status,l.fulfillment_synced_at,l.cdek_uuid,l.tracking_number
   FROM fulfillment_jobs j LEFT JOIN order_logistics l ON l.order_id=j.order_id WHERE j.order_id=$1`,[id])).rows[0];
  const fulfillment=ff?{state:ff.state,orderId:ff.external_id===null?null:String(ff.external_id),externalKey:ff.external_key,rawStatus:ff.fulfillment_raw_status??null,updatedAt:ff.fulfillment_synced_at??null,cdekUuid:ff.cdek_uuid??null,trackingNumber:ff.tracking_number??null}:null;
  const customer=o.customer_snapshot,delivery=o.delivery_snapshot;
  const str=(v:unknown)=>typeof v==='string'?v:'';
  const history=(await this.db.pool.query(`SELECT action,actor_id,detail,created_at FROM (
   SELECT id,action,actor_id,detail,created_at FROM audit_log WHERE entity_id=$1
   UNION ALL SELECT id,'status.'||kind||'.'||status,NULL::uuid,'{}'::jsonb,occurred_at FROM order_status_history WHERE order_id=$1::uuid
   ) events ORDER BY created_at DESC,id DESC LIMIT 50`,[id])).rows
   .map(r=>({action:r.action,actorId:r.actor_id,reason:str(r.detail?.reason),createdAt:r.created_at}));
  return {...order,fulfillment,paymentOnDelivery:await new CommerceService(this.db).isPaymentOnDelivery(id),reviewSignals,completion,dispatch,packing:packed?{packedBy:packed.packed_by,packedAt:packed.packed_at}:null,customer:{name:str(customer?.name),phone:str(customer?.phone)},
   delivery:{label:str(delivery?.label),city:str(delivery?.address?.city),address:str(delivery?.address?.address)},history};
 }
}
