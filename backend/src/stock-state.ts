import {Database} from './db.js';
import {canonical,DomainError,hash} from './core.js';
import {sourceKind,type SourceSettings} from './cdek-stock-source.js';

export const stockSourceHash=(s:SourceSettings)=>hash(canonical('kind' in s?[s.kind,s.shopId,s.accountId,s.externalWarehouseId,s.environment]:[s.feedUrl,s.accountId,s.externalWarehouseId,s.environment]));
const safeErrors=new Set(['STOCK_SOURCE_UNAVAILABLE','STOCK_SOURCE_UNAUTHORIZED','STOCK_SOURCE_RATE_LIMITED','STOCK_SOURCE_STALE',
 'STOCK_SOURCE_REGRESSED','STOCK_SOURCE_VERSION_CONFLICT','STOCK_REFRESH_FAILED']);
export const safeStockError=(value:unknown)=>typeof value==='string'&&safeErrors.has(value)?value:'STOCK_REFRESH_FAILED';

// Shared read model; no second stock table and no changes to the YCP wire contract.
// Provider count is NOT a claim that the provider exposes separate available/reserved fields.
export class StockState {
 constructor(private db:Database,private settings:SourceSettings,private clock=()=>new Date()){}
 async read(){
  const s=this.settings,at=this.clock();
  // One statement: metadata and per-SKU values must describe the same snapshot.
  const source=(await this.db.pool.query(`SELECT st.*,COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'sku',p.sku,'productId',p.id,'name',p.name,
    'category',e.published->'content'->>'category','image',e.published->'content'->>'image',
    'listed',i.listed,'quantity',i.provider_quantity) ORDER BY p.sku)
    FROM products p LEFT JOIN product_editor e ON e.product_id=p.id
    LEFT JOIN stock_source_items i ON i.warehouse_id=w.id AND i.product_id=p.id),'[]'::jsonb) AS items
   FROM warehouses w JOIN warehouse_external_ids x ON x.warehouse_id=w.id
   LEFT JOIN stock_sources st ON st.warehouse_id=w.id
   WHERE w.id=$1 AND w.active AND x.provider='cdek_ff' AND x.account_id=$2 AND x.external_id=$3`,
   [s.warehouseId,s.accountId,s.externalWarehouseId])).rows[0];
  if(!source)throw new DomainError('STOCK_WAREHOUSE_SCOPE_MISMATCH');
  if(source.source_hash&&source.source_hash!==stockSourceHash(s))throw new DomainError('STOCK_SOURCE_CHANGE_REQUIRES_REVIEW');
  const project=(r:typeof source)=>({
   syncedAt:r.fetched_at??null,sourceUpdatedAt:r.generated_at??null,expiresAt:r.expires_at??null,
   syncStatus:!r.source_hash?'never_synced':!r.healthy?'error':!r.expires_at||new Date(r.expires_at)<=at?'stale':'fresh',
   lastError:r.last_error?safeStockError(r.last_error):null,lastAttemptAt:r.last_attempt_at??null,
   nextAttemptAt:r.next_attempt_at??null,consecutiveFailures:r.consecutive_failures??0
  });
  return {source:{kind:sourceKind(s),warehouseId:s.warehouseId,accountId:s.accountId,
   mappingWarnings:source.unknown_skus??[],
   externalWarehouseId:s.externalWarehouseId,environment:s.environment,...project(source)},
   items:(source.items as Array<{sku:string;productId:string;name:string;category:string|null;image:string|null;listed:boolean|null;quantity:number|null}>).map(r=>{
    return {sku:r.sku,productId:r.productId,name:r.name,category:r.category,image:r.image,quantity:r.listed?r.quantity:null,
     quantityState:!source.fetched_at?'not_synced':r.listed?'known':'missing',...project(source)};
   })};
 }
}
