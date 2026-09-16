import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {Database} from './db.js';
import {cartSchema,normalizeCart,cartHash} from './commerce.js';
import {DomainError} from './core.js';

const addressSchema=z.object({city:z.string().trim().min(1).max(100),address:z.string().trim().min(3).max(300)}).strict();
export interface DeliveryProvider {
 quote(input:{address:z.infer<typeof addressSchema>;items:Array<{sku:string;quantity:number;weight_g:number|null;width_mm:number|null;height_mm:number|null;depth_mm:number|null}>}):Promise<{
  warehouseId:string;amountMinor:number;currency:'RUB';label:string;expiresInSeconds:number;
 }>;
}
export class DisabledDeliveryProvider implements DeliveryProvider {
 async quote():Promise<never>{throw new DomainError('DELIVERY_UNAVAILABLE',503);}
}
export class DeliveryService {
 constructor(private db:Database,private provider:DeliveryProvider=new DisabledDeliveryProvider(),private clock=()=>new Date()){}
 async quote(userId:string,raw:unknown) {
  const input=z.object({items:cartSchema,address:addressSchema}).strict().parse(raw);
  const items=normalizeCart(input.items);
  const {rows}=await this.db.pool.query(`SELECT p.sku,p.weight_g,p.width_mm,p.height_mm,p.depth_mm FROM products p
   JOIN product_prices price ON price.product_id=p.id AND price.approved
   WHERE p.sku=ANY($1::text[]) AND p.active AND p.sale_approved
   AND NOT EXISTS(SELECT 1 FROM product_components c WHERE c.product_id=p.id)`,[items.map(item=>item.sku)]);
  if(rows.length!==items.length)throw new DomainError('PRODUCT_UNAVAILABLE');
  let timer:ReturnType<typeof setTimeout>|undefined;
  let rawQuote:unknown;
  try {rawQuote=await Promise.race([
   this.provider.quote({address:input.address,items:items.map(item=>({...rows.find(row=>row.sku===item.sku),...item}))}),
   new Promise((_,reject)=>{timer=setTimeout(()=>reject(new DomainError('DELIVERY_UNAVAILABLE',503)),4000);})
  ]);}catch{throw new DomainError('DELIVERY_UNAVAILABLE',503);}finally{clearTimeout(timer);}
  const result=z.object({warehouseId:z.uuid(),amountMinor:z.number().int().min(0).max(1_000_000_000_000),currency:z.literal('RUB'),
   label:z.string().min(1).max(150),expiresInSeconds:z.number().int().min(30).max(900)}).strict().safeParse(rawQuote);
  if(!result.success)throw new DomainError('DELIVERY_UNAVAILABLE',503);
  const quote=result.data;const id=randomUUID(),expiresAt=new Date(this.clock().getTime()+quote.expiresInSeconds*1000);
  await this.db.transaction(async tx=>{
   if(!(await tx.query('SELECT 1 FROM warehouses WHERE id=$1 AND active FOR SHARE',[quote.warehouseId])).rowCount)throw new DomainError('DELIVERY_UNAVAILABLE',503);
   await tx.query(`INSERT INTO delivery_quotes(id,user_id,warehouse_id,amount_minor,currency,cart_hash,snapshot,expires_at,environment)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,'test')`,[id,userId,quote.warehouseId,quote.amountMinor,quote.currency,cartHash(items),JSON.stringify({label:quote.label,address:input.address}),expiresAt]);
  });
  return {deliveryQuoteId:id,amountMinor:quote.amountMinor,currency:quote.currency,label:quote.label,expiresAt:expiresAt.toISOString()};
 }
}
