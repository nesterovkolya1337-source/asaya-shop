import type {Tx} from './db.js';
import {DomainError} from './core.js';
export class StockMappingError extends DomainError {
 constructor(readonly articles:string[]){super('STOCK_PUBLISHED_MAPPING_ERROR',503);}
}
// One-way coverage: every provider article must be an exact storefront-published SKU.
// Published ASAYA products absent from the provider are intentionally not errors.
export async function checkPublishedStockCoverage(db:Pick<Tx,'query'>,articles:string[]){
 const {rows}=await db.query(`SELECT p.sku FROM products p JOIN product_editor e ON e.product_id=p.id
  WHERE p.sku=ANY($1::text[]) AND p.active AND p.archived_at IS NULL AND e.published IS NOT NULL
  AND e.published->>'sku'=p.sku
  AND EXISTS(SELECT 1 FROM product_prices pr WHERE pr.product_id=p.id)
  AND EXISTS(SELECT 1 FROM storefront_mappings m WHERE m.product_id=p.id AND m.approved)`,[articles]);
 const published=new Set(rows.map(r=>r.sku));
 const invalid=articles.filter(sku=>!published.has(sku));
 if(invalid.length)throw new StockMappingError(invalid);
}
