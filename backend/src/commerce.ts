import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Database,lock,type Tx } from './db.js';
import { canonical,hash,money,DomainError } from './core.js';
import {trackingProjection} from './order-tracking.js';
import {customerDelivery} from './customer-delivery.js';
import {customerOrderStatus} from './cdek-status.js';

export const cartSchema=z.array(z.object({sku:z.string().min(1).max(100),quantity:z.number().int().min(1).max(100)}).strict()).min(1).max(50);
export const checkoutSchema=z.object({
 items:cartSchema,deliveryQuoteId:z.uuid(),
 customer:z.object({name:z.string().trim().min(1).max(200),phone:z.string().regex(/^\+[1-9][0-9]{7,14}$/)}).strict(),
 consent:z.object({offerVersion:z.literal('test-v1'),privacyVersion:z.literal('test-v1'),marketing:z.boolean().default(false)}).strict(),
 expectedTotalMinor:z.number().int().nonnegative().max(1_000_000_000_000).optional()
}).strict();
export type CheckoutInput=z.infer<typeof checkoutSchema>;
export function normalizeCart(input:unknown) {
 const items=cartSchema.parse(input).sort((a,b)=>a.sku.localeCompare(b.sku));
 if(new Set(items.map(i=>i.sku)).size!==items.length) throw new DomainError('DUPLICATE_SKU',400);
 return items;
}
export const cartHash=(items:unknown)=>hash(canonical(normalizeCart(items)));
async function audit(tx:Tx,actor:string|null,action:string,id:string,detail:unknown={}) {
 await tx.query('INSERT INTO audit_log(id,actor_id,action,entity_id,detail) VALUES($1,$2,$3,$4,$5)',[randomUUID(),actor,action,id,JSON.stringify(detail)]);
}
async function event(tx:Tx,orderId:string,kind:string) {
 await tx.query(`INSERT INTO integration_outbox(id,kind,aggregate_id,payload,dedupe_key) VALUES($1,$2,$3,$4,$5)
  ON CONFLICT(dedupe_key) DO NOTHING`,[randomUUID(),kind,orderId,JSON.stringify({orderId}),`${orderId}:${kind}`]);
}
export class CommerceService {
 constructor(readonly db:Database,private clock=()=>new Date(),readonly environment:'test'|'production'='test') {}
 async catalog() {
  const {rows}=await this.db.pool.query(`SELECT p.sku,p.name,m.slug,pr.currency,pr.regular_minor,pr.final_minor,e.published->'content' AS content,
   COALESCE((SELECT sum(GREATEST(0,LEAST(b.on_hand,asaya_stock_limit(p.id,w.id,$1))-b.reserved)) FROM inventory_balances b JOIN warehouses w ON w.id=b.warehouse_id WHERE b.product_id=p.id AND w.active),0)::integer AS available,
   COALESCE((SELECT bool_and(CASE WHEN s.warehouse_id IS NULL THEN NOT $1 ELSE
    s.healthy AND s.expires_at>statement_timestamp() AND (NOT $1 OR s.environment='production') AND COALESCE(i.listed,false) END)
    FROM inventory_balances b JOIN warehouses w ON w.id=b.warehouse_id
    LEFT JOIN stock_sources s ON s.warehouse_id=w.id LEFT JOIN stock_source_items i ON i.warehouse_id=w.id AND i.product_id=p.id
    WHERE b.product_id=p.id AND w.active),false) AS stock_known
   FROM products p JOIN product_prices pr ON pr.product_id=p.id
   JOIN LATERAL(SELECT slug FROM storefront_mappings WHERE product_id=p.id AND approved ORDER BY slug LIMIT 1) m ON true
   LEFT JOIN product_editor e ON e.product_id=p.id
   WHERE p.active AND p.sale_approved AND pr.approved AND ($1=false OR e.published IS NOT NULL)
   AND NOT EXISTS(SELECT 1 FROM product_components c WHERE c.product_id=p.id) ORDER BY p.sku`,[this.environment==='production']);
  return rows.map(r=>({sku:r.sku,name:r.name,slug:r.slug,currency:r.currency,regularMinor:money(r.regular_minor),finalMinor:money(r.final_minor),available:r.available,stockState:r.available>0||r.stock_known?'known':'unknown',...(r.content?{content:r.content}:{})}));
 }
 async createCheckout(userId:string,key:string,raw:unknown) {
  z.string().min(16).max(128).regex(/^[A-Za-z0-9_-]+$/).parse(key);
  const input=checkoutSchema.parse(raw); input.items=normalizeCart(input.items);
  const fingerprint=hash(canonical(input)); const scope=`checkout:${userId}`; const now=this.clock();
  return this.db.transaction(async tx=>{
   await lock(tx,`${scope}:${key}`);
   const prior=(await tx.query('SELECT * FROM idempotency_records WHERE scope=$1 AND key=$2',[scope,key])).rows[0];
   if(prior) {
    if(prior.request_hash!==fingerprint) throw new DomainError('IDEMPOTENCY_CONFLICT');
    return prior.response as {orderId:string;checkoutId:string;publicNumber:string;totalMinor:number};
   }
   const user=(await tx.query('SELECT id FROM users WHERE id=$1 AND NOT disabled',[userId])).rows[0];
   if(!user) throw new DomainError('UNAUTHENTICATED',401);
   const quote=(await tx.query(`SELECT q.* FROM delivery_quotes q JOIN warehouses w ON w.id=q.warehouse_id
    WHERE q.id=$1 AND q.user_id=$2 AND w.active FOR SHARE OF q,w`,[input.deliveryQuoteId,userId])).rows[0];
   if(!quote||new Date(quote.expires_at)<=now||quote.cart_hash!==cartHash(input.items)||quote.environment!==this.environment) throw new DomainError('INVALID_DELIVERY_QUOTE');
   const lines=[]; let subtotal=0;
   for(const item of input.items) {
    const row=(await tx.query(`SELECT p.id,p.sku,p.name,pr.final_minor,b.on_hand,b.reserved,asaya_stock_limit(p.id,b.warehouse_id,$3) AS source_limit
     FROM products p JOIN product_prices pr ON pr.product_id=p.id
     JOIN inventory_balances b ON b.product_id=p.id AND b.warehouse_id=$2
     WHERE p.sku=$1 AND p.active AND p.sale_approved AND pr.approved AND pr.currency='RUB'
     AND NOT EXISTS(SELECT 1 FROM product_components c WHERE c.product_id=p.id)
     FOR UPDATE OF p,pr,b`,[item.sku,quote.warehouse_id,this.environment==='production'])).rows[0];
    if(!row) throw new DomainError('PRODUCT_UNAVAILABLE');
    if(Math.min(row.on_hand,row.source_limit)-row.reserved<item.quantity) throw new DomainError('INSUFFICIENT_STOCK');
    const unit=money(row.final_minor); const line=money(unit*item.quantity); subtotal=money(subtotal+line);
    lines.push({...row,quantity:item.quantity,unit,line});
   }
   const delivery=money(quote.amount_minor); const total=money(subtotal+delivery);
   if(input.expectedTotalMinor!==undefined&&input.expectedTotalMinor!==total) throw new DomainError('PRICE_CHANGED');
   const orderId=randomUUID(),checkoutId=randomUUID();
   const seq=(await tx.query("SELECT nextval('public_order_sequence') AS value")).rows[0].value;
   const publicNumber=`ASAYA-${seq}`; const expires=new Date(now.getTime()+3600_000);
   const contacts=(await tx.query('SELECT channel,destination FROM user_identities WHERE user_id=$1',[userId])).rows;
   await tx.query(`INSERT INTO checkout_sessions(id,user_id,status,snapshot,expires_at,created_at) VALUES($1,$2,'open',$3,$4,$5)`,[checkoutId,userId,JSON.stringify(input),expires,now]);
   await tx.query(`INSERT INTO orders(id,public_number,checkout_id,user_id,status,payment_status,delivery_status,currency,
    subtotal_minor,delivery_minor,total_minor,customer_snapshot,delivery_snapshot,consent_snapshot,created_at)
    VALUES($1,$2,$3,$4,'draft','pending','not_created','RUB',$5,$6,$7,$8,$9,$10,$11)`,
    [orderId,publicNumber,checkoutId,userId,subtotal,delivery,total,JSON.stringify({...input.customer,verifiedContacts:contacts}),JSON.stringify(quote.snapshot),JSON.stringify({...input.consent,acceptedAt:now.toISOString()}),now]);
   for(const line of lines) {
    await tx.query('INSERT INTO order_items(order_id,product_id,sku,name_snapshot,quantity,unit_minor,line_minor) VALUES($1,$2,$3,$4,$5,$6,$7)',[orderId,line.id,line.sku,line.name,line.quantity,line.unit,line.line]);
    await tx.query('UPDATE inventory_balances SET reserved=reserved+$3 WHERE product_id=$1 AND warehouse_id=$2',[line.id,quote.warehouse_id,line.quantity]);
    await tx.query("INSERT INTO inventory_reservations(order_id,product_id,warehouse_id,quantity,expires_at,status) VALUES($1,$2,$3,$4,$5,'active')",[orderId,line.id,quote.warehouse_id,line.quantity,expires]);
    await tx.query("INSERT INTO inventory_movements(id,order_id,product_id,warehouse_id,kind,quantity) VALUES($1,$2,$3,$4,'reserve',$5)",[randomUUID(),orderId,line.id,quote.warehouse_id,line.quantity]);
   }
   await tx.query("INSERT INTO order_status_history(id,order_id,kind,status,source) VALUES($1,$2,'order','draft','asaya')",[randomUUID(),orderId]);
   await audit(tx,userId,'checkout.created',orderId); await event(tx,orderId,'checkout.created');
   const response={orderId,checkoutId,publicNumber,totalMinor:total};
   await tx.query('INSERT INTO idempotency_records(scope,key,request_hash,response) VALUES($1,$2,$3,$4)',[scope,key,fingerprint,JSON.stringify(response)]);
   return response;
  });
 }
 async checkoutByKey(userId:string,key:string) {
  z.string().min(16).max(128).regex(/^[A-Za-z0-9_-]+$/).parse(key);
  const scope=`checkout:${userId}`;
  return this.db.transaction(async tx=>{
   await lock(tx,`${scope}:${key}`);
   const row=(await tx.query('SELECT response FROM idempotency_records WHERE scope=$1 AND key=$2',[scope,key])).rows[0];
   if(!row)throw new DomainError('CHECKOUT_NOT_FOUND',404);
   return row.response;
  });
 }
 async orders(userId:string,raw:unknown={}) {
  const {cursor,limit}=z.object({cursor:z.uuid().optional(),limit:z.coerce.number().int().min(1).max(50).default(20)}).strict().parse(raw);
  if(cursor && !(await this.db.pool.query('SELECT 1 FROM orders WHERE id=$1 AND user_id=$2',[cursor,userId])).rowCount)
   throw new DomainError('INVALID_ORDER_CURSOR',400);
  const {rows}=await this.db.pool.query(`SELECT o.id,o.public_number,o.status,o.payment_status,o.delivery_status,o.currency,o.total_minor,o.created_at,
   l.order_id AS tracked_order,l.fulfillment_status AS ff_status,l.delivery_status AS cdek_status
   FROM orders o LEFT JOIN order_logistics l ON l.order_id=o.id WHERE o.user_id=$1 AND ($2::uuid IS NULL OR (o.created_at,o.id)<
    (SELECT created_at,id FROM orders WHERE id=$2 AND user_id=$1))
   ORDER BY o.created_at DESC,o.id DESC LIMIT $3`,[userId,cursor??null,limit+1]);
  const page=rows.slice(0,limit);
  return {items:page.map(({tracked_order,ff_status,cdek_status,...row})=>({...row,...(tracked_order?{customer_status:customerOrderStatus({order:row.status,payment:row.payment_status,fulfillment:ff_status,delivery:cdek_status})}:{}),total_minor:money(row.total_minor)})),nextCursor:rows.length>limit?page.at(-1)!.id:null};
 }
 async order(userId:string,id:string) {
  z.uuid().parse(id);
  const row=(await this.db.pool.query(`SELECT id,public_number,status,payment_status,delivery_status,currency,subtotal_minor,delivery_minor,total_minor,created_at,delivery_snapshot
   FROM orders WHERE id=$1 AND user_id=$2`,[id,userId])).rows[0];
  if(!row) throw new DomainError('ORDER_NOT_FOUND',404);
  const items=(await this.db.pool.query('SELECT sku,name_snapshot,quantity,unit_minor,line_minor FROM order_items WHERE order_id=$1 ORDER BY sku',[id])).rows;
  const dispatched=(await this.db.pool.query(`SELECT d.carrier,d.tracking_number FROM order_dispatch d JOIN orders o ON o.id=d.order_id WHERE d.order_id=$1 AND o.user_id=$2`,[id,userId])).rows[0];
  const history=(await this.db.pool.query('SELECT kind,status,occurred_at FROM order_status_history WHERE order_id=$1 ORDER BY occurred_at,id',[id])).rows;
  const {delivery_snapshot:delivery,...summary}=row;
  const tracking=await trackingProjection(this.db,row);
  return {...summary,...(tracking?{tracking}:{}),delivery:customerDelivery(delivery),statusHistory:history,
   shipment:dispatched?{carrier:dispatched.carrier,trackingNumber:dispatched.tracking_number}:null,subtotal_minor:money(row.subtotal_minor),delivery_minor:money(row.delivery_minor),total_minor:money(row.total_minor),
   canCancel:this.environment!=='production'&&row.status==='draft'&&['pending','failed'].includes(row.payment_status),
   items:items.map(r=>({...r,unit_minor:money(r.unit_minor),line_minor:money(r.line_minor)}))};
 }
 private async release(tx:Tx,orderId:string) {
  const rows=(await tx.query("SELECT r.* FROM inventory_reservations r JOIN products p ON p.id=r.product_id WHERE r.order_id=$1 AND r.status='active' ORDER BY p.sku,r.warehouse_id FOR UPDATE OF r",[orderId])).rows;
  for(const r of rows) {
   await tx.query('UPDATE inventory_balances SET reserved=reserved-$3 WHERE product_id=$1 AND warehouse_id=$2',[r.product_id,r.warehouse_id,r.quantity]);
   await tx.query("UPDATE inventory_reservations SET status='released' WHERE order_id=$1 AND product_id=$2 AND warehouse_id=$3",[orderId,r.product_id,r.warehouse_id]);
   await tx.query("INSERT INTO inventory_movements(id,order_id,product_id,warehouse_id,kind,quantity) VALUES($1,$2,$3,$4,'release',$5)",[randomUUID(),orderId,r.product_id,r.warehouse_id,r.quantity]);
  }
 }
 private async cancelLocked(tx:Tx,order:any,reason:'cancelled'|'expired',actor:string|null,note?:string) {
  await this.release(tx,order.id);
  await tx.query("UPDATE orders SET status='cancelled',payment_status='cancelled',delivery_status='cancelled',updated_at=$2 WHERE id=$1",[order.id,this.clock()]);
  await tx.query('UPDATE checkout_sessions SET status=$2 WHERE id=$1',[order.checkout_id,reason]);
  await tx.query("INSERT INTO order_status_history(id,order_id,kind,status,source) VALUES($1,$2,'order','cancelled',$3)",[randomUUID(),order.id,reason]);
  await audit(tx,actor,`order.${reason}`,order.id,note?{reason:note,source:'admin'}:{}); await event(tx,order.id,`order.${reason}`);
 }
 async cancel(userId:string,orderId:string) {
  z.uuid().parse(orderId);
  await this.db.transaction(async tx=>{
   const o=(await tx.query('SELECT * FROM orders WHERE id=$1 AND user_id=$2 FOR UPDATE',[orderId,userId])).rows[0];
   if(!o) throw new DomainError('ORDER_NOT_FOUND',404);
   if(o.status==='cancelled') return;
   if(o.status!=='draft'||!['pending','failed'].includes(o.payment_status)) throw new DomainError('CANCELLATION_REQUIRES_REVIEW');
   await this.cancelLocked(tx,o,'cancelled',userId);
  });
 }
 async adminCancel(actor:string,orderId:string,raw:unknown) {
  z.uuid().parse(orderId);const {reason}=z.object({reason:z.string().trim().min(3).max(1000)}).strict().parse(raw);
  await this.db.transaction(async tx=>{
   if(!(await tx.query("SELECT 1 FROM users WHERE id=$1 AND role='admin' AND NOT disabled FOR SHARE",[actor])).rowCount)throw new DomainError('FORBIDDEN',403);
   const o=(await tx.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE',[orderId])).rows[0];
   if(!o)throw new DomainError('ORDER_NOT_FOUND',404);
   if(o.status==='cancelled')return;
   if(o.status!=='draft'||!['pending','failed'].includes(o.payment_status))throw new DomainError('CANCELLATION_REQUIRES_REVIEW');
   await this.cancelLocked(tx,o,'cancelled',actor,reason);
  });
 }
 async isPaymentOnDelivery(orderId:string,tx?:Tx):Promise<boolean>{
  const result=await (tx??this.db.pool).query(`SELECT 1 FROM orders o JOIN ycp_sessions s ON s.order_id=o.id
   WHERE o.id=$1 AND o.payment_status='pending' AND s.environment=$2 AND s.payment_method='on_delivery'
   AND s.placement_outcome='placed' AND s.placement_hash IS NOT NULL AND s.external_order_id IS NOT NULL`,[orderId,this.environment]);
  return result.rowCount===1;
 }
 async adminStartProcessing(actor:string,orderId:string,raw:unknown) {
  z.uuid().parse(orderId);z.object({}).strict().parse(raw);
  await this.db.transaction(async tx=>{
   if(!(await tx.query("SELECT 1 FROM users WHERE id=$1 AND role='admin' AND NOT disabled FOR SHARE",[actor])).rowCount)throw new DomainError('FORBIDDEN',403);
   const o=(await tx.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE',[orderId])).rows[0];
   if(!o)throw new DomainError('ORDER_NOT_FOUND',404);
   if(o.status==='processing'&&(o.payment_status==='paid'||await this.isPaymentOnDelivery(orderId,tx))&&o.delivery_status==='preparing')return;
   if(o.status!=='placed'||!(o.payment_status==='paid'||await this.isPaymentOnDelivery(orderId,tx))||o.delivery_status!=='not_created')throw new DomainError('ORDER_NOT_READY_FOR_PROCESSING');
   const lines=(await tx.query('SELECT product_id,quantity FROM order_items WHERE order_id=$1',[orderId])).rows;
   await this.assertReserved(tx,orderId,lines);
   await tx.query("UPDATE orders SET status='processing',delivery_status='preparing',updated_at=$2 WHERE id=$1",[orderId,this.clock()]);
   for(const [kind,status] of [['order','processing'],['delivery','preparing']])
    await tx.query('INSERT INTO order_status_history(id,order_id,kind,status,source) VALUES($1,$2,$3,$4,$5)',[randomUUID(),orderId,kind,status,'admin']);
   await audit(tx,actor,'order.processing_started',orderId);
   await event(tx,orderId,'order.processing_started');
  });
 }
 private async assertReserved(tx:Tx,orderId:string,lines:Array<{product_id:string;quantity:number}>){
  if((await tx.query('SELECT 1 FROM fulfillment_jobs WHERE order_id=$1',[orderId])).rowCount)throw new DomainError('FULFILLMENT_MANAGED_ORDER');
  const reserves=(await tx.query("SELECT product_id,quantity FROM inventory_reservations WHERE order_id=$1 AND status='active' FOR SHARE",[orderId])).rows;
  const reserved=new Map<string,number>();for(const r of reserves)reserved.set(r.product_id,(reserved.get(r.product_id)??0)+r.quantity);
  if(!lines.length||reserved.size!==lines.length||lines.some(i=>reserved.get(i.product_id)!==i.quantity))throw new DomainError('ORDER_RESERVATION_MISSING');
 }
 async adminCompletePacking(actor:string,orderId:string,raw:unknown){
  z.uuid().parse(orderId);const body=z.object({items:cartSchema}).strict().parse(raw),checked=normalizeCart(body.items);
  await this.db.transaction(async tx=>{
   if(!(await tx.query("SELECT 1 FROM users WHERE id=$1 AND role='admin' AND NOT disabled FOR SHARE",[actor])).rowCount)throw new DomainError('FORBIDDEN',403);
   const o=(await tx.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE',[orderId])).rows[0];
   if(!o)throw new DomainError('ORDER_NOT_FOUND',404);
   if(o.status!=='processing'||!(o.payment_status==='paid'||await this.isPaymentOnDelivery(orderId,tx))||o.delivery_status!=='preparing')throw new DomainError('ORDER_NOT_READY_FOR_PACKING');
   const lines=(await tx.query('SELECT product_id,sku,quantity FROM order_items WHERE order_id=$1 ORDER BY sku',[orderId])).rows;
   const counts=new Map(checked.map(i=>[i.sku,i.quantity]));
   if(lines.length!==checked.length||lines.some(i=>counts.get(i.sku)!==i.quantity))throw new DomainError('PACKING_ITEMS_MISMATCH');
   if((await tx.query('SELECT 1 FROM order_packing WHERE order_id=$1',[orderId])).rowCount)return;
   await this.assertReserved(tx,orderId,lines);
   const items=lines.map(i=>({sku:i.sku,quantity:i.quantity}));
   await tx.query('INSERT INTO order_packing(order_id,packed_by,packed_at,items) VALUES($1,$2,$3,$4)',[orderId,actor,this.clock(),JSON.stringify(items)]);
   await tx.query('UPDATE orders SET updated_at=$2 WHERE id=$1',[orderId,this.clock()]);
   await audit(tx,actor,'order.packing_completed',orderId,{items});
   await event(tx,orderId,'order.packing_completed');
  });
 }
 async adminDispatch(actor:string,orderId:string,raw:unknown){
  z.uuid().parse(orderId);
  const input=z.object({carrier:z.string().trim().min(1).max(100).regex(/^[^\u0000-\u001f\u007f]+$/),trackingNumber:z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9А-Яа-яЁё _-]+$/),confirmed:z.literal(true)}).strict().parse(raw);
  await this.db.transaction(async tx=>{
   if(!(await tx.query("SELECT 1 FROM users WHERE id=$1 AND role='admin' AND NOT disabled FOR SHARE",[actor])).rowCount)throw new DomainError('FORBIDDEN',403);
   const o=(await tx.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE',[orderId])).rows[0];
   if(!o)throw new DomainError('ORDER_NOT_FOUND',404);
   const prior=(await tx.query('SELECT carrier,tracking_number FROM order_dispatch WHERE order_id=$1',[orderId])).rows[0];
   if(prior){if(prior.carrier!==input.carrier||prior.tracking_number!==input.trackingNumber)throw new DomainError('DISPATCH_CONFLICT');return;}
   if(o.status!=='processing'||!(o.payment_status==='paid'||await this.isPaymentOnDelivery(orderId,tx))||o.delivery_status!=='preparing')throw new DomainError('ORDER_NOT_READY_FOR_DISPATCH');
   if(!(await tx.query('SELECT 1 FROM order_packing WHERE order_id=$1',[orderId])).rowCount)throw new DomainError('ORDER_NOT_PACKED');
   if((await tx.query('SELECT 1 FROM shipments WHERE order_id=$1',[orderId])).rowCount)throw new DomainError('DISPATCH_CONFLICT');
   const lines=(await tx.query('SELECT product_id,quantity FROM order_items WHERE order_id=$1',[orderId])).rows;
   await this.assertReserved(tx,orderId,lines);
   const reserves=(await tx.query("SELECT r.* FROM inventory_reservations r JOIN products p ON p.id=r.product_id WHERE r.order_id=$1 AND r.status='active' ORDER BY p.sku,r.warehouse_id FOR UPDATE OF r",[orderId])).rows;
   for(const r of reserves){
    const changed=await tx.query('UPDATE inventory_balances SET on_hand=on_hand-$3,reserved=reserved-$3 WHERE product_id=$1 AND warehouse_id=$2 AND reserved >= $3 AND on_hand >= $3',[r.product_id,r.warehouse_id,r.quantity]);
    if(changed.rowCount!==1)throw new DomainError('ORDER_RESERVATION_MISSING');
    await tx.query("UPDATE inventory_reservations SET status='consumed' WHERE order_id=$1 AND product_id=$2 AND warehouse_id=$3",[orderId,r.product_id,r.warehouse_id]);
    await tx.query("INSERT INTO inventory_movements(id,order_id,product_id,warehouse_id,kind,quantity) VALUES($1,$2,$3,$4,'ship',$5)",[randomUUID(),orderId,r.product_id,r.warehouse_id,r.quantity]);
   }
   const shipmentId=randomUUID(),at=this.clock();
   await tx.query("INSERT INTO shipments(id,order_id,provider,account_id,environment,status,snapshot) VALUES($1,$2,'manual','local',$3,'shipped',$4)",[shipmentId,orderId,this.environment,JSON.stringify({carrier:input.carrier,trackingNumber:input.trackingNumber,source:'admin'})]);
   await tx.query('INSERT INTO order_dispatch(order_id,shipment_id,carrier,tracking_number,dispatched_by,dispatched_at) VALUES($1,$2,$3,$4,$5,$6)',[orderId,shipmentId,input.carrier,input.trackingNumber,actor,at]);
   await tx.query("UPDATE orders SET delivery_status='shipped',updated_at=$2 WHERE id=$1",[orderId,at]);
   await tx.query("INSERT INTO order_status_history(id,order_id,kind,status,source) VALUES($1,$2,'delivery','shipped','admin')",[randomUUID(),orderId]);
   await audit(tx,actor,'order.dispatched',orderId,{carrier:input.carrier,trackingNumber:input.trackingNumber,shipmentId});
   await event(tx,orderId,'order.dispatched');
  });
 }
 async adminCompleteOrder(actor:string,orderId:string,raw:unknown){
  z.uuid().parse(orderId);
  const {reason}=z.object({reason:z.string().trim().min(3).max(1000),confirmed:z.literal(true)}).strict().parse(raw);
  await this.db.transaction(async tx=>{
   if(!(await tx.query("SELECT 1 FROM users WHERE id=$1 AND role='admin' AND NOT disabled FOR SHARE",[actor])).rowCount)throw new DomainError('FORBIDDEN',403);
   const o=(await tx.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE',[orderId])).rows[0];
   if(!o)throw new DomainError('ORDER_NOT_FOUND',404);
   const prior=(await tx.query('SELECT reason FROM order_completion WHERE order_id=$1',[orderId])).rows[0];
   if(prior){if(prior.reason!==reason)throw new DomainError('COMPLETION_CONFLICT');return;}
   if(o.status!=='processing'||o.payment_status!=='paid'||!['shipped','arrived_to_pickup_point'].includes(o.delivery_status))throw new DomainError('ORDER_NOT_READY_FOR_COMPLETION');
   const shipment=(await tx.query(`SELECT s.id,s.status,s.provider,s.environment FROM order_dispatch d JOIN shipments s ON s.id=d.shipment_id AND s.order_id=d.order_id WHERE d.order_id=$1 FOR UPDATE OF s`,[orderId])).rows[0];
   if(!shipment||shipment.provider!=='manual'||shipment.environment!==this.environment||!['shipped','arrived_to_pickup_point'].includes(shipment.status))throw new DomainError('ORDER_NOT_READY_FOR_COMPLETION');
   const at=this.clock();
   await tx.query('INSERT INTO order_completion(order_id,completed_by,completed_at,reason) VALUES($1,$2,$3,$4)',[orderId,actor,at,reason]);
   await tx.query("UPDATE orders SET status='completed',delivery_status='delivered',updated_at=$2 WHERE id=$1",[orderId,at]);
   await tx.query("UPDATE shipments SET status='delivered' WHERE id=$1",[shipment.id]);
   await tx.query("INSERT INTO shipment_events(id,shipment_id,status,occurred_at,external_event_id) VALUES($1,$2,'delivered',$3,$4)",[randomUUID(),shipment.id,at,`admin:completion:${orderId}`]);
   for(const [kind,status] of [['order','completed'],['delivery','delivered']])await tx.query('INSERT INTO order_status_history(id,order_id,kind,status,source) VALUES($1,$2,$3,$4,$5)',[randomUUID(),orderId,kind,status,'admin']);
   await audit(tx,actor,'order.completed',orderId,{reason,source:'admin'});
   await event(tx,orderId,'order.completed');
  });
 }
 async expire(scope?:{accountId:string;environment:'test'|'production'}) {
  if(scope)z.object({accountId:z.string().min(1).max(500),environment:z.literal(this.environment)}).strict().parse(scope);
  if(this.environment==='production'&&!scope)throw new DomainError('YCP_EXPIRY_SCOPE_REQUIRED');
  // A production sweep owns only this integration's reservations. Development
  // sweeps cannot release another integration's production stock.
  const scopeSql=scope
   ? 'EXISTS (SELECT 1 FROM ycp_sessions y WHERE y.order_id=o.id AND y.account_id=$3 AND y.environment=$4)'
   : "NOT EXISTS (SELECT 1 FROM ycp_sessions y WHERE y.order_id=o.id AND y.environment='production')";
  const parameters=(id:string|null)=>[id,this.clock(),...(scope?[scope.accountId,scope.environment]:[])];
  if(this.environment==='production'){
   // A local timeout is not proof of failed payment. Keep stock reserved until an
   // authenticated provider result/cancellation arrives. The outbox survives restarts.
   await this.db.transaction(async tx=>{
    const candidates=(await tx.query(`SELECT o.id FROM orders o JOIN checkout_sessions s ON s.id=o.checkout_id
     WHERE o.status='draft' AND o.payment_status IN ('pending','failed') AND s.status='open'
     AND s.created_at<=$1::timestamptz-interval '30 minutes'
     AND EXISTS(SELECT 1 FROM ycp_sessions y WHERE y.order_id=o.id AND y.account_id=$2 AND y.environment=$3)
     AND NOT EXISTS(SELECT 1 FROM integration_outbox e WHERE e.dedupe_key=o.id::text||':ycp.payment_reconcile_required')
     ORDER BY o.id LIMIT 100`,[this.clock(),scope!.accountId,scope!.environment])).rows;
    for(const candidate of candidates)await event(tx,candidate.id,'ycp.payment_reconcile_required');
   });
   return 0;
  }
  const {rows}=await this.db.pool.query(`SELECT o.id FROM orders o JOIN checkout_sessions s ON s.id=o.checkout_id
   WHERE ($1::uuid IS NULL) AND o.status='draft' AND o.payment_status IN ('pending','failed') AND s.status='open' AND s.expires_at<=$2
   AND ${scopeSql} ORDER BY o.id LIMIT 100`,parameters(null));
  let count=0;
  for(const candidate of rows) count+=await this.db.transaction(async tx=>{
   const o=(await tx.query(`SELECT o.* FROM orders o JOIN checkout_sessions s ON s.id=o.checkout_id
    WHERE o.id=$1 AND o.status='draft' AND o.payment_status IN ('pending','failed') AND s.status='open' AND s.expires_at<=$2
    AND ${scopeSql} FOR UPDATE OF o SKIP LOCKED`,parameters(candidate.id))).rows[0];
   if(!o)return 0; await this.cancelLocked(tx,o,'expired',null);return 1;
  });
  return count;
 }
 // Internal boundary only. No public route can assert payment success.
 async recordPaid(eventInput:{provider:string;accountId:string;environment:'test'|'production';eventId:string;externalPaymentId:string;orderId:string;amountMinor:number;currency:'RUB'}) {
  const e=z.object({provider:z.string().min(1).max(100),accountId:z.string().min(1).max(100),environment:z.enum(['test','production']),eventId:z.string().min(1).max(200),externalPaymentId:z.string().min(1).max(200),orderId:z.uuid(),amountMinor:z.number().int().positive().max(1_000_000_000_000),currency:z.literal('RUB')}).strict().parse(eventInput);
  if(e.environment!==this.environment) throw new DomainError('ENVIRONMENT_MISMATCH');
  return this.db.transaction(async tx=>{
   await lock(tx,`payment:${e.provider}:${e.accountId}:${e.environment}:${e.externalPaymentId}`);
   await lock(tx,`event:${e.provider}:${e.accountId}:${e.environment}:${e.eventId}`);
   const digest=hash(canonical(e));
   const prior=(await tx.query('SELECT payload_hash FROM integration_inbox WHERE provider=$1 AND account_id=$2 AND environment=$3 AND event_id=$4',[e.provider,e.accountId,e.environment,e.eventId])).rows[0];
   if(prior) {if(prior.payload_hash!==digest) throw new DomainError('EVENT_CONFLICT'); return;}
   const o=(await tx.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE',[e.orderId])).rows[0];
   if(!o) throw new DomainError('ORDER_NOT_FOUND',404);
   if(money(o.total_minor)!==e.amountMinor||o.currency!==e.currency) throw new DomainError('PAYMENT_AMOUNT_MISMATCH');
   const existing=(await tx.query('SELECT id,order_id,status,amount_minor,currency FROM payments WHERE provider=$1 AND account_id=$2 AND environment=$3 AND external_id=$4 FOR UPDATE',[e.provider,e.accountId,e.environment,e.externalPaymentId])).rows[0];
   if(existing&&existing.order_id!==o.id) throw new DomainError('PAYMENT_ORDER_CONFLICT');
   if(existing&&(money(existing.amount_minor)!==e.amountMinor||existing.currency!==e.currency)) throw new DomainError('PAYMENT_AMOUNT_MISMATCH');
   const settled=['paid','partially_refunded','refunded'];
   const otherPaid=(await tx.query("SELECT 1 FROM payments WHERE order_id=$1 AND status IN ('paid','partially_refunded','refunded') AND ($2::uuid IS NULL OR id<>$2::uuid)",[o.id,existing?.id??null])).rowCount;
   if(otherPaid||(!existing&&settled.includes(o.payment_status))) throw new DomainError('SECOND_PAYMENT_REQUIRES_REVIEW');
   // A later delivery of the original success event must not undo a refund.
   if((['partially_refunded','refunded'].includes(o.payment_status)||['partially_refunded','refunded'].includes(existing?.status))&&(!existing||!settled.includes(existing.status))) throw new DomainError('PAYMENT_STATE_REQUIRES_REVIEW');
   // Late payments are retained as financial facts, but never revive a released reservation.
   if(!existing) await tx.query(`INSERT INTO payments(id,order_id,provider,account_id,environment,external_id,status,amount_minor,currency)
    VALUES($1,$2,$3,$4,$5,$6,'paid',$7,$8)`,[randomUUID(),o.id,e.provider,e.accountId,e.environment,e.externalPaymentId,e.amountMinor,e.currency]);
   else if(!settled.includes(existing.status)) await tx.query("UPDATE payments SET status='paid' WHERE id=$1",[existing.id]);
   if(!settled.includes(o.payment_status)&&!['partially_refunded','refunded'].includes(existing?.status)) {
    await tx.query("UPDATE orders SET payment_status='paid',status=CASE WHEN status='draft' THEN 'placed' ELSE status END,updated_at=$2 WHERE id=$1",[o.id,this.clock()]);
    if(o.status==='draft') await tx.query("UPDATE checkout_sessions SET status='placed' WHERE id=$1",[o.checkout_id]);
    await tx.query("INSERT INTO order_status_history(id,order_id,kind,status,source) VALUES($1,$2,'payment','paid',$3)",[randomUUID(),o.id,e.provider]);
    await event(tx,o.id,o.status==='cancelled'?'payment.late_review':'order.paid');
   }
   await tx.query('INSERT INTO integration_inbox(provider,account_id,environment,event_id,payload_hash) VALUES($1,$2,$3,$4,$5)',[e.provider,e.accountId,e.environment,e.eventId,digest]);
  });
 }
}
