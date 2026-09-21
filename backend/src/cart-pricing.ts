import {z} from 'zod';
import type {Tx} from './db.js';
import {DomainError,money} from './core.js';
import {liveMarketing,type MarketingConfig} from './marketing.js';

export const cartItemsSchema=z.object({items:z.array(z.object({sku:z.string().min(1).max(200),quantity:z.number().int().min(1).max(100)}).strict()).max(50)}).strict().refine(v=>new Set(v.items.map(i=>i.sku)).size===v.items.length);
type Line={sku:string;quantity:number;finalMinor:number;eligible:boolean};
export async function priceRows(db:Pick<Tx,'query'>,rows:Array<{sku:string;final_minor:unknown}>,quantities:Array<{sku:string;quantity:number}>){
 const {rows:types}=await db.query(`SELECT p.sku,(${eligibleSql}) AS eligible,s.live FROM marketing_settings s
  CROSS JOIN products p LEFT JOIN product_editor e ON e.product_id=p.id WHERE s.id=true AND p.sku=ANY($1::text[])`,[rows.map(r=>r.sku)]);
 const settings=types[0]?.live??await liveMarketing(db);
 return priceCart(rows.map(r=>({sku:r.sku,quantity:quantities.find(i=>i.sku===r.sku)!.quantity,finalMinor:money(r.final_minor),eligible:types.find(t=>t.sku===r.sku)?.eligible===true})),settings);
}
export function priceCart(lines:Line[],settings:MarketingConfig){
 const eligibleUnits=lines.reduce((n,i)=>n+(i.eligible?i.quantity:0),0);
 const percent=eligibleUnits>=3?settings.threePercent:eligibleUnits===2?settings.twoPercent:0;
 // Quantity-discounted unit price rounds down once to whole RUB; totals use this value.
 const items=lines.map(i=>({...i,unitMinor:i.eligible&&percent?Math.floor(i.finalMinor*(100-percent)/10000)*100:i.finalMinor}));
 const subtotalMinor=money(items.reduce((n,i)=>n+i.unitMinor*i.quantity,0));
 const beforeMinor=money(lines.reduce((n,i)=>n+i.finalMinor*i.quantity,0));
 return {items,eligibleUnits,percent,subtotalMinor,discountMinor:beforeMinor-subtotalMinor,settings,shippingRemainingMinor:Math.max(0,settings.freeShippingMinor-subtotalMinor)};
}
// Only published canonical classification participates; unpublished editor drafts do not.
export const eligibleSql=`COALESCE(e.published->'content'->>'category','')<>'sets'
 AND COALESCE(e.published->'content'->>'setKind','none')='none'
 AND NOT EXISTS(SELECT 1 FROM product_components component WHERE component.product_id=p.id)`;
export async function cartPricing(db:Pick<Tx,'query'>,raw:unknown){
 const body=cartItemsSchema.parse(raw);
 // A single statement snapshots both live configuration and canonical prices.
 const {rows}=await db.query(`SELECT p.sku,pr.final_minor,(${eligibleSql}) AS eligible,s.live
  FROM marketing_settings s LEFT JOIN (products p JOIN product_prices pr ON pr.product_id=p.id
   JOIN product_editor e ON e.product_id=p.id AND e.published IS NOT NULL)
  ON p.sku=ANY($1::text[]) AND p.active AND p.archived_at IS NULL AND p.sale_approved AND pr.approved AND pr.currency='RUB'
  WHERE s.id=true`,[body.items.map(i=>i.sku)]);
 const products=rows.filter(r=>r.sku);
 if(products.length!==body.items.length)throw new DomainError('PRODUCT_UNAVAILABLE',409);
 const settings=rows[0]?.live??await liveMarketing(db);
 return priceCart(body.items.map(i=>{const p=products.find(p=>p.sku===i.sku)!;return {...i,finalMinor:money(p.final_minor),eligible:p.eligible};}),settings);
}
