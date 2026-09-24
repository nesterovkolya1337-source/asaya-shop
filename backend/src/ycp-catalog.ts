import {priceRows} from './cart-pricing.js';
import {z} from 'zod';
import type {Database} from './db.js';
import {DomainError,equal,hash,money} from './core.js';
import {ycpWarehouses} from './warehouses.js';

declare module 'fastify' { interface FastifyContextConfig { ycp?:boolean } }

const nonempty=z.string().trim().min(1).max(500);
export const ycpSettingsSchema=z.object({
 accountId:nonempty,
 environment:z.enum(['test','production']),
 publicOrigin:z.url().refine(value=>{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&u.pathname==='/'&&!u.search&&!u.hash;}),
 // Deprecated input keys remain parseable for existing deployment files.
 // Custom-site YCP uses rubles; these keys no longer select the wire representation.
 priceUnit:z.enum(['minor','rubles']).nullable().optional(),
 warehouseSource:z.enum(['configuration','database']).optional(),
 vat:z.number().int().min(0).max(100).nullable().optional(),
 checkout:z.object({deliveryPriceUnit:z.enum(['minor','rubles'])}).strict().optional(),
 button:z.object({enabled:z.boolean()}).strict().optional(),
 feed:z.object({name:z.string().trim().min(1).max(20),company:z.string().trim().min(1).max(500)}).strict().optional(),
 warehouses:z.array(z.object({
  warehouseId:z.uuid(),address:nonempty,phone:nonempty,
  servedLocalities:z.array(nonempty).max(1000).default([]),
  ycpDeliveryEnabled:z.boolean()
 }).strict()).max(1000)
}).strict().refine(s=>new Set(s.warehouses.map(w=>w.warehouseId)).size===s.warehouses.length,{message:'Duplicate warehouse'});
export type YcpSettings=z.infer<typeof ycpSettingsSchema>;
export function parseYcpSettings(settings:unknown,allowProduction=false):YcpSettings{
 const parsed=ycpSettingsSchema.parse(settings);
 if(parsed.environment==='production'&&!allowProduction)throw new Error('YCP production integration requires the explicit ycp deployment mode');
 return parsed;
}
const basketSchema=z.object({
 items:z.array(z.object({id:z.string().min(1).max(200),quantity:z.number().int().min(1).max(100)}).strict()).min(1).max(50),
 offers_id_from_merchant_center:z.boolean(),locality:nonempty,is_health_check:z.boolean()
}).strict().refine(b=>new Set(b.items.map(i=>i.id)).size===b.items.length,{message:'Duplicate item'});

export class YcpCatalog {
 private settings:YcpSettings;
 private tokenHash:string;
 constructor(private db:Database,token:string,settings:unknown,allowProduction=false){
  this.tokenHash=hash(z.string().min(32).max(4096).regex(/^[A-Za-z0-9._~+\/-]+=*$/).parse(token));
  this.settings=parseYcpSettings(settings,allowProduction);
 }
 authorize(header:string|undefined){
  const match=header?.match(/^Bearer ([A-Za-z0-9._~+\/-]+=*)$/i);
  if(!match||!equal(hash(match[1]!),this.tokenHash))throw new DomainError('UNAUTHORIZED',401);
 }
 async warehouses(raw:unknown){
  const {limit,offset}=z.object({limit:z.coerce.number().int().min(1).max(1000),offset:z.coerce.number().int().min(0).max(1_000_000)}).strict().parse(raw);
  const profiles=await ycpWarehouses(this.db.pool,this.settings);
  const {rows}=await this.db.pool.query('SELECT id,name FROM warehouses WHERE active AND id=ANY($1::uuid[]) ORDER BY id',[profiles.map(w=>w.warehouseId)]);
  return {warehouses:rows.slice(offset,offset+limit).map(row=>{
   const profile=profiles.find(w=>w.warehouseId===row.id)!;
   return {id:row.id,title:row.name,address:profile.address,phone:profile.phone,...(profile.description?{description:profile.description}:{}),self_pickup_options:{enabled:false},ycp_delivery_options:{enabled:profile.ycpDeliveryEnabled}};
  }),total_count:rows.length};
 }
 async basket(raw:unknown){
  const input=basketSchema.parse(raw),settings=this.settings;
  const warehouseIds=(await ycpWarehouses(this.db.pool,settings,true)).map(w=>w.warehouseId);
  // One statement gives all prices and warehouse balances from the same DB snapshot.
  // YCP available_quantity is the current purchase ceiling, not measured provider stock.
  // Shared asaya_stock_limit fails closed for missing/stale/failed production sources;
  // Admin/ASAYA retain the unknown/stale distinction, which YCP has no field for.
  // Request quantity never overrides this ceiling; checking does not reserve or sync.
  const {rows}=await this.db.pool.query(`SELECT requested.request_id,p.sku,p.name,p.weight_g,p.width_mm,p.height_mm,p.depth_mm,
   pr.regular_minor,pr.final_minor,m.slug,e.published->'content'->>'image' AS image,
   COALESCE((SELECT jsonb_agg(jsonb_build_object('id',w.id,'available_quantity',GREATEST(0,LEAST(b.on_hand,asaya_stock_limit(p.id,w.id,$4='production'))-b.reserved)) ORDER BY w.id)
    FROM inventory_balances b JOIN warehouses w ON w.id=b.warehouse_id
    WHERE b.product_id=p.id AND w.active AND w.id=ANY($5::uuid[])),'[]'::jsonb) AS warehouses
   FROM unnest($1::text[]) WITH ORDINALITY AS requested(request_id,position)
   JOIN products p ON (p.sku=requested.request_id OR ($2::boolean AND p.id=(SELECT x.product_id FROM product_external_ids x
    WHERE x.provider='ycp' AND x.account_id=$3 AND x.environment=$4 AND x.external_id=requested.request_id)
    ))
   JOIN product_prices pr ON pr.product_id=p.id AND pr.approved AND pr.currency='RUB'
   JOIN LATERAL(SELECT slug FROM storefront_mappings WHERE product_id=p.id AND approved ORDER BY slug LIMIT 1) m ON true
   LEFT JOIN product_editor e ON e.product_id=p.id
   WHERE p.active AND p.sale_approved AND ($4<>'production' OR e.published IS NOT NULL)
   AND NOT EXISTS(SELECT 1 FROM product_components c WHERE c.product_id=p.id)
   ORDER BY requested.position`,[input.items.map(i=>i.id),input.offers_id_from_merchant_center,settings.accountId,settings.environment,warehouseIds]);
  if(rows.length!==input.items.length)throw new DomainError('PRODUCTS_NOT_FOUND',404);
  if(new Set(rows.map(r=>r.sku)).size!==rows.length)throw new DomainError('DUPLICATE_PRODUCT',400);
  const pricing=await priceRows(this.db.pool,rows,rows.map(r=>({sku:r.sku,quantity:input.items.find(i=>i.id===r.request_id)!.quantity})));
  const price=(value:unknown)=>{
   const minor=money(value);
   if(minor%100!==0)throw new DomainError('YCP_PRICE_NOT_REPRESENTABLE',503);
   return minor/100;
  };
  return {items:rows.map(row=>{
   const img=row.image?new URL(row.image,settings.publicOrigin):null;
   if(img&&(img.protocol!=='https:'||img.username||img.password))throw new DomainError('YCP_IMAGE_NOT_CONFIGURED',503);
   return {id:row.sku,name:row.name,regular_price:price(row.regular_minor),final_price:price(pricing.items.find(i=>i.sku===row.sku)!.unitMinor),...(settings.vat!=null?{vat:settings.vat}:{}),
    ...(img?{img:img.href}:{}),url:new URL('/product/'+encodeURIComponent(row.slug)+'/',settings.publicOrigin).href,
    warehouses:row.warehouses,dimensions:{...(row.width_mm!=null?{width:row.width_mm}:{}),...(row.height_mm!=null?{height:row.height_mm}:{}),...(row.depth_mm!=null?{depth:row.depth_mm}:{}),...(row.weight_g!=null?{weight:row.weight_g}:{})},characteristics:[],variations:[]};
  })};
 }
}
