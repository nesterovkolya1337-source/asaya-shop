import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {Database,type Tx} from './db.js';
import {canonical,hash,DomainError} from './core.js';
import {parseYcpSettings,type YcpSettings} from './ycp-catalog.js';
import {YcpConflict} from './ycp-checkout.js';

const querySchema=z.object({order_id:z.string().min(1).max(200)}).strict();
const deliveredSchema=z.object({purchased_items:z.array(z.object({id:z.string().min(1).max(100),quantity:z.number().int().min(0).max(100)}).strict()).max(50)}).strict()
 .refine(b=>new Set(b.purchased_items.map(i=>i.id)).size===b.purchased_items.length,{message:'Duplicate SKU'});
async function event(tx:Tx,order:string,kind:string){
 await tx.query('INSERT INTO audit_log(id,action,entity_id,detail) VALUES($1,$2,$3,$4)',[randomUUID(),kind,order,JSON.stringify({source:'ycp'})]);
 await tx.query('INSERT INTO integration_outbox(id,kind,aggregate_id,payload,dedupe_key) VALUES($1,$2,$3,$4,$5) ON CONFLICT(dedupe_key) DO NOTHING',[randomUUID(),kind,order,JSON.stringify({orderId:order}),`${order}:${kind}`]);
}
const statusMap:Record<string,string>={preparing:'in_progress',shipped:'in_progress',handed_to_cdek:'in_progress',in_transit:'in_progress',out_for_delivery:'in_progress',ready_for_pickup:'arrived_to_pickup_point',arrived_to_pickup_point:'arrived_to_pickup_point',delivered:'delivered',cancelled:'cancelled',returned:'cancelled',returning:'in_progress'};
function timestamp(value:unknown){const n=Math.floor(new Date(String(value)).getTime()/1000);if(!Number.isInteger(n)||n<0||n>4294967295)throw new DomainError('INVALID_STATUS_TIMESTAMP',500);return n;}
export class YcpOrders {
 private settings:YcpSettings;
 constructor(private db:Database,settings:unknown,private clock=()=>new Date(),allowProduction=false){
  this.settings=parseYcpSettings(settings,allowProduction);
 }
 private scope(){return [this.settings.accountId,this.settings.environment];}
 private async locked(tx:Tx,external:string){
  const row=(await tx.query(`SELECT o.*,y.payment_method FROM ycp_sessions y JOIN orders o ON o.id=y.order_id
   WHERE y.account_id=$1 AND y.environment=$2 AND y.external_order_id=$3 FOR UPDATE OF o`,[...this.scope(),external])).rows[0];
  if(!row)throw new DomainError('ORDER_NOT_FOUND',404);return row;
 }
 async get(raw:unknown){
  const q=querySchema.parse(raw);
  // All projection fields come from one PostgreSQL statement snapshot.
  const row=(await this.db.pool.query(`SELECT o.created_at,o.updated_at,
   COALESCE((SELECT l.delivery_status FROM order_logistics l WHERE l.order_id=o.id),o.delivery_status) AS delivery_status,
   (SELECT jsonb_agg(jsonb_build_object('id',i.sku,'quantity',i.quantity,'refused_count',CASE WHEN o.status='cancelled' THEN i.quantity ELSE i.refused_count END) ORDER BY i.sku) FROM order_items i WHERE i.order_id=o.id) AS items,
   COALESCE((SELECT jsonb_agg(jsonb_build_object('status',h.status,'at',h.occurred_at) ORDER BY h.occurred_at,h.id)
    FROM (
     SELECT h.id,h.status,h.occurred_at FROM order_status_history h WHERE h.order_id=o.id AND h.source<>'cdek'
      AND (h.kind='delivery' OR (h.kind='order' AND h.status='cancelled'))
     UNION ALL
     SELECT e.id,e.status,e.occurred_at FROM order_logistics_events e WHERE e.order_id=o.id AND e.provider='cdek' AND NOT e.deleted
    ) h),'[]'::jsonb) AS history,
   COALESCE((SELECT s.tracking_url FROM shipments s WHERE s.order_id=o.id AND s.environment=$2
    AND ((s.provider='ycp' AND s.account_id=$1) OR (s.provider='manual' AND s.account_id='local')) AND s.tracking_url IS NOT NULL ORDER BY s.id LIMIT 1),
    (SELECT 'https://www.cdek.ru/ru/tracking/' FROM order_logistics l WHERE l.order_id=o.id AND l.environment=$2 AND l.tracking_number IS NOT NULL)) AS tracking_url
   FROM ycp_sessions y JOIN orders o ON o.id=y.order_id WHERE y.account_id=$1 AND y.environment=$2 AND y.external_order_id=$3`,[...this.scope(),q.order_id])).rows[0];
  if(!row)throw new DomainError('ORDER_NOT_FOUND',404);
  const statuses=[{status:'new',timestamp:timestamp(row.created_at)}];
  for(const h of row.history){const status=statusMap[h.status];if(status&&statuses.at(-1)!.status!==status)statuses.push({status,timestamp:timestamp(h.at)});}
  const current=statusMap[row.delivery_status];
  if(current&&statuses.at(-1)!.status!==current)statuses.push({status:current,timestamp:timestamp(row.updated_at)});
  let tracking:string|undefined;
  if(row.tracking_url){try{const url=new URL(row.tracking_url);if(url.protocol==='https:'&&!url.username&&!url.password)tracking=url.href;}catch{/* Invalid legacy URL is not exposed. */}}
  return {items:row.items??[],delivery_statuses:statuses,...(tracking?{tracking_url:tracking}:{})};
 }
 private async inventory(tx:Tx,order:string){
  const lines=(await tx.query('SELECT product_id,sku,quantity FROM order_items WHERE order_id=$1 ORDER BY sku',[order])).rows;
  const reserves=(await tx.query('SELECT r.* FROM inventory_reservations r JOIN products p ON p.id=r.product_id WHERE r.order_id=$1 ORDER BY p.sku,r.warehouse_id FOR UPDATE OF r',[order])).rows;
  if(!lines.length||reserves.some(r=>!lines.some(i=>i.product_id===r.product_id))||lines.some(i=>reserves.filter(r=>r.product_id===i.product_id).reduce((n,r)=>n+r.quantity,0)!==i.quantity))throw new YcpConflict('ORDER_RESERVATION_MISSING');
  return {lines,reserves};
 }
 private async changeStock(tx:Tx,order:string,reserves:any[],operation:'release'|'ship'){
  for(const r of reserves){
   if(r.status!=='active')continue;
   // Refused parcels are not sellable warehouse stock until physical return is confirmed.
   const result=await tx.query(`UPDATE inventory_balances SET reserved=reserved-$3,on_hand=on_hand-$4
    WHERE product_id=$1 AND warehouse_id=$2 AND reserved>=$3 AND on_hand>=$4`,[r.product_id,r.warehouse_id,r.quantity,operation==='ship'?r.quantity:0]);
   if(result.rowCount!==1)throw new YcpConflict('INVENTORY_STATE_REQUIRES_REVIEW');
   await tx.query('UPDATE inventory_reservations SET status=$4 WHERE order_id=$1 AND product_id=$2 AND warehouse_id=$3',[order,r.product_id,r.warehouse_id,operation==='ship'?'consumed':'released']);
   await tx.query('INSERT INTO inventory_movements(id,order_id,product_id,warehouse_id,kind,quantity) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),order,r.product_id,r.warehouse_id,operation,r.quantity]);
  }
 }
 private async receipt(tx:Tx,order:string,kind:string,digest:string){
  const prior=(await tx.query('SELECT request_hash FROM ycp_order_receipts WHERE order_id=$1 AND kind=$2',[order,kind])).rows[0];
  if(prior&&prior.request_hash!==digest)throw new YcpConflict('ORDER_EVENT_CONFLICT');return Boolean(prior);
 }
 private async save(tx:Tx,order:string,kind:string,digest:string,status:string){
  const at=this.clock();
  await tx.query('INSERT INTO ycp_order_receipts(order_id,kind,request_hash,received_at) VALUES($1,$2,$3,$4)',[order,kind,digest,at]);
  await tx.query('UPDATE orders SET status=$2,delivery_status=$3,updated_at=$4 WHERE id=$1',[order,status,kind==='delivered'?'delivered':'cancelled',at]);
  for(const [type,value] of [['order',status],['delivery',kind==='delivered'?'delivered':'cancelled']])await tx.query("INSERT INTO order_status_history(id,order_id,kind,status,source,occurred_at) VALUES($1,$2,$3,$4,'ycp',$5)",[randomUUID(),order,type,value,at]);
 }
 async delivered(rawQuery:unknown,raw:unknown){
  const q=querySchema.parse(rawQuery),body=deliveredSchema.parse(raw);body.purchased_items.sort((a,b)=>a.id.localeCompare(b.id));
  const digest=hash(canonical(body));
  return this.db.transaction(async tx=>{
   const o=await this.locked(tx,q.order_id);
   if(o.status==='cancelled')throw new YcpConflict('ORDER_CANCELLED');
   if(await this.receipt(tx,o.id,'delivered',digest))return {};
   if(!['placed','processing','completed'].includes(o.status)||!['paid','pending','partially_refunded','refunded'].includes(o.payment_status))throw new YcpConflict('ORDER_STATE_REQUIRES_REVIEW');
   const {lines,reserves}=await this.inventory(tx,o.id),purchased=new Map(body.purchased_items.map(i=>[i.id,i.quantity]));
   if(body.purchased_items.some(i=>!lines.some(l=>l.sku===i.id)))throw new DomainError('PRODUCT_NOT_FOUND',404);
   if(lines.some(i=>(purchased.get(i.sku)??0)>i.quantity))throw new DomainError('PURCHASED_QUANTITY_INVALID',400);
   if(reserves.some(r=>!['active','consumed'].includes(r.status)))throw new YcpConflict('INVENTORY_STATE_REQUIRES_REVIEW');
   await this.changeStock(tx,o.id,reserves,'ship');
   let refused=0;
   for(const line of lines){const bought=purchased.get(line.sku)??0;refused+=line.quantity-bought;await tx.query('UPDATE order_items SET purchased_count=$3,refused_count=quantity-$3 WHERE order_id=$1 AND product_id=$2',[o.id,line.product_id,bought]);}
   await this.save(tx,o.id,'delivered',digest,'completed');
   // Preserve provider identifiers and tracking; the notification does not invent shipment IDs.
   await tx.query("UPDATE shipments SET status='delivered' WHERE order_id=$1 AND environment=$2",[o.id,this.settings.environment]);
   await event(tx,o.id,'ycp.order.delivered');
   if(refused){await event(tx,o.id,'ycp.return_review');if(o.payment_status==='paid'||o.payment_status==='partially_refunded')await event(tx,o.id,'payment.refund_review');}
   if(o.payment_method==='on_delivery'&&o.payment_status==='pending')await event(tx,o.id,'ycp.cod_payment_review');
   return {};
  });
 }
 async cancel(raw:unknown){
  const q=querySchema.parse(raw),digest=hash(canonical(q));
  return this.db.transaction(async tx=>{
   const o=await this.locked(tx,q.order_id);
   if(await this.receipt(tx,o.id,'cancelled',digest))return {};
   if((await tx.query("SELECT 1 FROM fulfillment_jobs WHERE order_id=$1 AND state IN ('sending','uncertain','created')",[o.id])).rowCount){await event(tx,o.id,'fulfillment.cancel_review');return {};}
   if(o.status==='completed'||o.delivery_status==='delivered'||(await tx.query("SELECT 1 FROM ycp_order_receipts WHERE order_id=$1 AND kind='delivered'",[o.id])).rowCount)throw new YcpConflict('DELIVERED_ORDER_REQUIRES_RETURN');
   const {reserves}=await this.inventory(tx,o.id);
   // A missing dispatch event must not make in-transit goods available for sale.
   if(reserves.some(r=>r.status==='active')&&['shipped','arrived_to_pickup_point','returned'].includes(o.delivery_status))throw new YcpConflict('INVENTORY_STATE_REQUIRES_REVIEW');
   await this.changeStock(tx,o.id,reserves,'release');
   await tx.query('UPDATE order_items SET purchased_count=0,refused_count=quantity WHERE order_id=$1',[o.id]);
   await this.save(tx,o.id,'cancelled',digest,'cancelled');
   await tx.query("UPDATE checkout_sessions SET status='cancelled' WHERE id=$1",[o.checkout_id]);
   // Cancellation is not a confirmation that money has been refunded.
   if(['pending','failed','authorized'].includes(o.payment_status)){
    if(o.payment_status==='authorized')await event(tx,o.id,'payment.void_review');
    else await tx.query("UPDATE orders SET payment_status='cancelled' WHERE id=$1",[o.id]);
   }
   const paid=(await tx.query("SELECT 1 FROM payments WHERE order_id=$1 AND status IN ('paid','partially_refunded')",[o.id])).rowCount;
   if(paid||['paid','partially_refunded'].includes(o.payment_status))await event(tx,o.id,'payment.refund_review');
   if(reserves.some(r=>r.status==='consumed'))await event(tx,o.id,'ycp.return_review');
   await event(tx,o.id,'ycp.order.cancelled');return {};
  });
 }
}
