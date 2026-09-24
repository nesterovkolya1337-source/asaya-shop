import {snapshotLoyalty,earnLoyalty} from './loyalty.js';
import {priceRows} from './cart-pricing.js';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {Database,lock,type Tx} from './db.js';
import {canonical,hash,money,DomainError} from './core.js';
import {parseYcpSettings,type YcpSettings} from './ycp-catalog.js';
import {ycpWarehouses} from './warehouses.js';
import {saveYcpCustomer} from './customer-account.js';
import {normalizeCustomerPhone} from './customer-phone.js';

const id=z.string().min(1).max(200),text=z.string().trim().min(1).max(1000);
const price=z.number().int().nonnegative().max(1_000_000_000_000);
const interval=z.object({date:z.iso.date(),time:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/).optional()}).strict();
const delivery=z.object({
 delivery_method:z.enum(['courier','pickup_point','self_pickup']),
 service_type:z.enum(['yandex_delivery','cdek','pecom','russian_post','dalli','self_pickup','merchant_ship','ycp']),
 service_display_name:text.optional(),price:z.number().nonnegative().max(1_000_000_000_000),
 address:z.object({locality:text.optional(),address:text.optional(),apartment:text.optional(),entrance:text.optional(),floor:text.optional(),intercom:text.optional(),pickup_point_id:id.optional()}).strict(),
 delivery_date_interval:z.object({start_interval:interval,end_interval:interval,time_zone:z.number().int().min(-12).max(14)}).strict(),
 ycp_delivery_option_id:id.optional()
}).strict().refine(d=>d.delivery_method==='pickup_point'?Boolean(d.address.pickup_point_id):Boolean(d.address.locality&&d.address.address),{message:'Delivery address missing'})
 .refine(d=>d.delivery_date_interval.start_interval.date<=d.delivery_date_interval.end_interval.date,{message:'Invalid delivery date interval'});
const createSchema=z.object({session_id:id,warehouse_id:z.uuid(),
 items:z.array(z.object({id:z.string().min(1).max(100),quantity:z.number().int().min(1).max(100),regular_price:price,final_price:price}).strict()).min(1).max(50),
 customer:z.object({full_name:text,phone:z.string().trim().min(1).max(100),email:z.email().max(254)}).strict(),delivery
}).strict().refine(b=>new Set(b.items.map(i=>i.id)).size===b.items.length,{message:'Duplicate SKU'});
const placedSchema=z.object({session_id:id,order_id:id,order_number:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
 payment_method:z.enum(['online','on_delivery']),online_payment_method:z.enum(['card','sbp','split','split_sbp']).optional(),acquiring_id:id.optional()
}).strict().refine(b=>b.payment_method==='online'||!b.acquiring_id&&!b.online_payment_method,{message:'Payment details do not match payment method'});
export class YcpConflict extends DomainError {
 constructor(code:string,readonly details:Record<string,unknown>={}){super(code,409);}
}
function toMinor(value:number){
 // Decimal parsing avoids floating point rounding or accepting fractions of a kopeck.
 const decimal=String(value).match(/^(\d+)(?:\.(\d+))?$/);
 if(!decimal)throw new DomainError('INVALID_AMOUNT',400);
 const fraction=decimal[2]??'';
 if(fraction.length>2)throw new DomainError('INVALID_AMOUNT',400);
 return money(Number(decimal[1])*100+Number(fraction.padEnd(2,'0')));
}
async function history(tx:Tx,order:string,kind:string,status:string){await tx.query("INSERT INTO order_status_history(id,order_id,kind,status,source) VALUES($1,$2,$3,$4,'ycp')",[randomUUID(),order,kind,status]);}
async function notify(tx:Tx,order:string,kind:string){
 await tx.query('INSERT INTO audit_log(id,action,entity_id,detail) VALUES($1,$2,$3,$4)',[randomUUID(),kind,order,JSON.stringify({source:'ycp'})]);
 await tx.query('INSERT INTO integration_outbox(id,kind,aggregate_id,payload,dedupe_key) VALUES($1,$2,$3,$4,$5) ON CONFLICT(dedupe_key) DO NOTHING',[randomUUID(),kind,order,JSON.stringify({orderId:order}),`${order}:${kind}`]);
}
export class YcpCheckout {
 private settings:YcpSettings;
 constructor(private db:Database,settings:unknown,private clock=()=>new Date(),allowProduction=false){
  this.settings=parseYcpSettings(settings,allowProduction);
 }
 private scope(){return [this.settings.accountId,this.settings.environment];}
 private async sessionLock(tx:Tx,session:string){await lock(tx,canonical(['ycp-session',...this.scope(),session]));}
 async create(raw:unknown){
  const body=createSchema.parse(raw);body.items.sort((a,b)=>a.id.localeCompare(b.id));
  const s=this.settings,digest=hash(canonical(body));
  return this.db.transaction(async tx=>{
   await this.sessionLock(tx,body.session_id);
   const prior=(await tx.query(`SELECT y.request_hash,o.public_number,o.status FROM ycp_sessions y JOIN orders o ON o.id=y.order_id
    WHERE y.account_id=$1 AND y.environment=$2 AND y.session_id=$3`,[...this.scope(),body.session_id])).rows[0];
   if(prior){
    if(prior.status==='cancelled')throw new YcpConflict('CHECKOUT_CANCELLED',{checkout_canceled:true});
    if(prior.request_hash!==digest)throw new YcpConflict('SESSION_CONFLICT');
    return {order_number:prior.public_number};
   }
   if(['self_pickup','merchant_ship','ycp'].includes(body.delivery.service_type)||body.delivery.delivery_method==='self_pickup'||body.delivery.ycp_delivery_option_id)throw new DomainError('YCP_DELIVERY_MODE_NOT_SUPPORTED',400);
   const profile=(await ycpWarehouses(tx,s,true,true)).find(w=>w.warehouseId===body.warehouse_id);
   // Yandex/CDEK determine delivery coverage; retain the supplied address in the order.
   if(!profile)throw new YcpConflict('WAREHOUSE_UNAVAILABLE');
   if(!(await tx.query('SELECT 1 FROM warehouses WHERE id=$1 AND active FOR SHARE',[body.warehouse_id])).rowCount)throw new YcpConflict('WAREHOUSE_UNAVAILABLE');
   const {rows}=await tx.query(`SELECT p.id,p.sku,p.name,pr.regular_minor,pr.final_minor,GREATEST(0,LEAST(b.on_hand,asaya_stock_limit(p.id,b.warehouse_id,$3))-b.reserved) AS available
    FROM products p JOIN product_prices pr ON pr.product_id=p.id AND pr.approved AND pr.currency='RUB'
    JOIN inventory_balances b ON b.product_id=p.id AND b.warehouse_id=$2
    WHERE p.sku=ANY($1::text[]) AND p.active AND p.sale_approved
    AND EXISTS(SELECT 1 FROM storefront_mappings m WHERE m.product_id=p.id AND m.approved)
    AND ($3=false OR EXISTS(SELECT 1 FROM product_editor e WHERE e.product_id=p.id AND e.published IS NOT NULL))
    AND NOT EXISTS(SELECT 1 FROM product_components c WHERE c.product_id=p.id)
    ORDER BY p.sku FOR UPDATE OF p,pr,b`,[body.items.map(i=>i.id),body.warehouse_id,s.environment==='production']);
   const pricing=await priceRows(tx,rows,body.items.map(i=>({sku:i.id,quantity:i.quantity})));
   for(const row of rows)row.final_minor=pricing.items.find(i=>i.sku===row.sku)!.unitMinor;
   const convert=(n:unknown)=>{const value=money(n);if(value%100)throw new DomainError('YCP_PRICE_NOT_REPRESENTABLE',503);return value/100;};
   const actual={items:rows.map(r=>({id:r.sku,regular_price:convert(r.regular_minor),final_price:convert(r.final_minor),warehouses:[{id:body.warehouse_id,available_quantity:r.available}]}))};
   if(rows.length!==body.items.length||body.items.some(i=>{const r=rows.find(r=>r.sku===i.id);return !r||i.quantity>r.available||i.regular_price!==convert(r.regular_minor)||i.final_price!==convert(r.final_minor);}))throw new YcpConflict('INVENTORY_CHANGED',{actual_inventory:actual,checkout_canceled:false});
   const subtotal=money(body.items.reduce((sum,i)=>sum+money(rows.find(r=>r.sku===i.id)!.final_minor)*i.quantity,0));
   const deliveryMinor=toMinor(body.delivery.price),total=money(subtotal+deliveryMinor);
   if(total===0)throw new DomainError('ZERO_TOTAL_NOT_SUPPORTED',400);
   const order=randomUUID(),checkout=randomUUID(),guest=randomUUID(),at=this.clock(),expires=new Date(at.getTime()+3600000);
   const publicNumber=`ASAYA-${(await tx.query("SELECT nextval('public_order_sequence') AS n")).rows[0].n}`;
   // A YCP contact snapshot is not proof of ownership of a local login account.
   await tx.query('INSERT INTO users(id,disabled) VALUES($1,true)',[guest]);
   await tx.query("INSERT INTO checkout_sessions(id,user_id,status,provider,provider_account,external_session_id,snapshot,expires_at,created_at) VALUES($1,$7,'open','ycp',$2,$3,$4,$5,$6)",[checkout,s.accountId,body.session_id,JSON.stringify(body),expires,at,guest]);
   const address=body.delivery.address;
   await tx.query(`INSERT INTO orders(id,public_number,checkout_id,user_id,status,payment_status,delivery_status,currency,subtotal_minor,delivery_minor,total_minor,customer_snapshot,delivery_snapshot,consent_snapshot,created_at)
    VALUES($1,$2,$3,$11,'draft','pending','not_created','RUB',$4,$5,$6,$7,$8,$9,$10)`,[order,publicNumber,checkout,subtotal,deliveryMinor,total,
    JSON.stringify({name:body.customer.full_name,phone:body.customer.phone,email:body.customer.email,source:'ycp'}),
    JSON.stringify({source:'ycp',label:body.delivery.service_display_name??body.delivery.service_type,address:{city:address.locality??'',address:[address.address??(address.pickup_point_id?`ПВЗ ${address.pickup_point_id}`:undefined),address.apartment&&`кв. ${address.apartment}`,address.entrance&&`подъезд ${address.entrance}`,address.floor&&`этаж ${address.floor}`,address.intercom&&`домофон ${address.intercom}`].filter(Boolean).join(', ')},ycp:body.delivery}),
    JSON.stringify({source:'ycp',localConsentNotAsserted:true}),at,guest]);
   await snapshotLoyalty(tx,order,subtotal);
   for(const i of body.items){const row=rows.find(r=>r.sku===i.id)!;
    await tx.query('INSERT INTO order_items(order_id,product_id,sku,name_snapshot,quantity,unit_minor,line_minor) VALUES($1,$2,$3,$4,$5,$6,$7)',[order,row.id,row.sku,row.name,i.quantity,row.final_minor,money(money(row.final_minor)*i.quantity)]);
    await tx.query('UPDATE inventory_balances SET reserved=reserved+$3 WHERE product_id=$1 AND warehouse_id=$2',[row.id,body.warehouse_id,i.quantity]);
    await tx.query("INSERT INTO inventory_reservations(order_id,product_id,warehouse_id,quantity,expires_at,status) VALUES($1,$2,$3,$4,$5,'active')",[order,row.id,body.warehouse_id,i.quantity,expires]);
    await tx.query("INSERT INTO inventory_movements(id,order_id,product_id,warehouse_id,kind,quantity) VALUES($1,$2,$3,$4,'reserve',$5)",[randomUUID(),order,row.id,body.warehouse_id,i.quantity]);
   }
   await tx.query('INSERT INTO ycp_sessions(account_id,environment,session_id,order_id,request_hash) VALUES($1,$2,$3,$4,$5)',[...this.scope(),body.session_id,order,digest]);
   await history(tx,order,'order','draft');await notify(tx,order,'checkout.created');
   return {order_number:publicNumber};
  });
 }
 async placed(raw:unknown,query:unknown={}){
  const body=placedSchema.parse(raw),q=z.object({session_id:id.optional(),order_id:id.optional(),payment_method:z.enum(['online','on_delivery']).optional()}).strict().parse(query);
  if(Object.entries(q).some(([key,value])=>body[key as keyof typeof body]!==value))throw new DomainError('PLACEMENT_QUERY_CONFLICT',400);
  const digest=hash(canonical(body));
  const late=await this.db.transaction(async tx=>{
   await this.sessionLock(tx,body.session_id);
   // Match SMS claim lock order (phone, then order), avoiding a placement/login deadlock.
   const contact=(await tx.query(`SELECT o.customer_snapshot FROM ycp_sessions y JOIN orders o ON o.id=y.order_id
    WHERE y.account_id=$1 AND y.environment=$2 AND y.session_id=$3`,[...this.scope(),body.session_id])).rows[0];
   const phone=normalizeCustomerPhone(contact?.customer_snapshot?.phone??'');
   if(phone)await lock(tx,'customer-orders:'+phone);
   // Same payment lock order as CommerceService.recordPaid: payment, then order.
   // Missing acquiring_id is allowed by the official placed schema. The fallback is an
   // internal ledger reference, never an invented acquiring transaction identifier.
   const paymentReference=body.acquiring_id??`placement:${body.order_id}`;
   if(body.payment_method==='online')await lock(tx,`payment:ycp:${this.settings.accountId}:${this.settings.environment}:${paymentReference}`);
   await lock(tx,canonical(['ycp-order',...this.scope(),body.order_id]));
   await lock(tx,canonical(['ycp-order-number',...this.scope(),body.order_number]));
   const row=(await tx.query(`SELECT y.*,o.status,o.payment_status,o.total_minor,o.checkout_id FROM ycp_sessions y JOIN orders o ON o.id=y.order_id
    WHERE y.account_id=$1 AND y.environment=$2 AND y.session_id=$3 FOR UPDATE OF o,y`,[...this.scope(),body.session_id])).rows[0];
   if(!row)throw new DomainError('CHECKOUT_NOT_FOUND',404);
   if(row.placement_hash){if(row.placement_hash!==digest)throw new YcpConflict('PLACEMENT_CONFLICT');return row.placement_outcome==='late_review';}
   if((await tx.query('SELECT 1 FROM ycp_sessions WHERE account_id=$1 AND environment=$2 AND (external_order_id=$3 OR external_order_number=$4) AND session_id<>$5',[...this.scope(),body.order_id,body.order_number,body.session_id])).rowCount)throw new YcpConflict('YCP_ORDER_CONFLICT');
   if(row.status!=='draft'&&row.status!=='cancelled')throw new YcpConflict('ORDER_STATE_REQUIRES_REVIEW');
   if(!['pending','failed','cancelled'].includes(row.payment_status))throw new YcpConflict('PAYMENT_STATE_REQUIRES_REVIEW');
   const isLate=row.status==='cancelled';
   if(!isLate){
    const missing=(await tx.query(`SELECT 1 FROM order_items i LEFT JOIN inventory_reservations r ON r.order_id=i.order_id AND r.product_id=i.product_id AND r.status='active'
     WHERE i.order_id=$1 GROUP BY i.product_id,i.quantity HAVING COALESCE(sum(r.quantity),0)<>i.quantity`,[row.order_id])).rowCount;
    if(missing)throw new YcpConflict('ORDER_RESERVATION_MISSING');
   }
   if(body.payment_method==='online'){
    if((await tx.query("SELECT 1 FROM payments WHERE provider='ycp' AND account_id=$1 AND environment=$2 AND external_id=$3",[...this.scope(),paymentReference])).rowCount)throw new YcpConflict('PAYMENT_ORDER_CONFLICT');
    await tx.query("INSERT INTO payments(id,order_id,provider,account_id,environment,external_id,status,amount_minor,currency) VALUES($1,$2,'ycp',$3,$4,$5,'paid',$6,'RUB')",[randomUUID(),row.order_id,...this.scope(),paymentReference,row.total_minor]);
   }
   await tx.query('UPDATE ycp_sessions SET placement_hash=$4,placement_outcome=$5,external_order_id=$6,external_order_number=$7,payment_method=$8,acquiring_id=$9,online_payment_method=$10 WHERE account_id=$1 AND environment=$2 AND session_id=$3',[...this.scope(),body.session_id,digest,isLate?'late_review':'placed',body.order_id,body.order_number,body.payment_method,body.acquiring_id??null,body.online_payment_method??null]);
   await tx.query('UPDATE orders SET external_ycp_order_id=$2,external_ycp_order_number=$3 WHERE id=$1',[row.order_id,body.order_id,body.order_number]);
   await saveYcpCustomer(tx,row.order_id);
   if(isLate){
    // Preserve cancellation/released stock, but do not hide confirmed money received.
    if(body.payment_method==='online'){
     await tx.query("UPDATE orders SET payment_status='paid',updated_at=$2 WHERE id=$1",[row.order_id,this.clock()]);
     await history(tx,row.order_id,'payment','paid');
    }
    await notify(tx,row.order_id,'ycp.placement_after_cancel');return true;
   }
   const payment=body.payment_method==='online'?'paid':'pending';
   await tx.query("UPDATE orders SET status='placed',payment_status=$2,updated_at=$3 WHERE id=$1",[row.order_id,payment,this.clock()]);
   await tx.query("UPDATE checkout_sessions SET status='placed' WHERE id=$1",[row.checkout_id]);
   if(payment==='paid')await earnLoyalty(tx,row.order_id);
   await history(tx,row.order_id,'order','placed');if(payment==='paid')await history(tx,row.order_id,'payment','paid');
   await notify(tx,row.order_id,payment==='paid'?'order.paid':'ycp.order.placed');return false;
  });
  if(late)throw new YcpConflict('CHECKOUT_CANCELLED',{checkout_canceled:true});
  return {};
 }
 async cancel(raw:unknown){
  const {session_id}=z.object({session_id:id}).strict().parse(raw);
  return this.db.transaction(async tx=>{
   await this.sessionLock(tx,session_id);
   const row=(await tx.query(`SELECT o.* FROM ycp_sessions y JOIN orders o ON o.id=y.order_id
    WHERE y.account_id=$1 AND y.environment=$2 AND y.session_id=$3 FOR UPDATE OF o`,[...this.scope(),session_id])).rows[0];
   if(!row)throw new DomainError('CHECKOUT_NOT_FOUND',404);
   if(row.status==='cancelled')return {};
   if(row.status!=='draft'||!['pending','failed'].includes(row.payment_status))throw new YcpConflict('CANCELLATION_REQUIRES_REVIEW');
   const {rows}=await tx.query("SELECT r.* FROM inventory_reservations r JOIN products p ON p.id=r.product_id WHERE r.order_id=$1 AND r.status='active' ORDER BY p.sku,r.warehouse_id FOR UPDATE OF r",[row.id]);
   for(const r of rows){
    await tx.query('UPDATE inventory_balances SET reserved=reserved-$3 WHERE product_id=$1 AND warehouse_id=$2',[r.product_id,r.warehouse_id,r.quantity]);
    await tx.query("UPDATE inventory_reservations SET status='released' WHERE order_id=$1 AND product_id=$2 AND warehouse_id=$3",[row.id,r.product_id,r.warehouse_id]);
    await tx.query("INSERT INTO inventory_movements(id,order_id,product_id,warehouse_id,kind,quantity) VALUES($1,$2,$3,$4,'release',$5)",[randomUUID(),row.id,r.product_id,r.warehouse_id,r.quantity]);
   }
   await tx.query("UPDATE orders SET status='cancelled',payment_status='cancelled',delivery_status='cancelled',updated_at=$2 WHERE id=$1",[row.id,this.clock()]);
   await tx.query("UPDATE checkout_sessions SET status='cancelled' WHERE id=$1",[row.checkout_id]);
   for(const kind of ['order','payment','delivery'])await history(tx,row.id,kind,'cancelled');await notify(tx,row.id,'order.cancelled');return {};
  });
 }
}
