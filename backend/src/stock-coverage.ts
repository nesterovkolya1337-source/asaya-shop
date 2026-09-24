import type {Tx} from './db.js';
// One-way coverage: unmatched provider articles are diagnostics, not a sync failure.
// Historical catalog identity survives unpublishing/archiving. Drafts are not stock requirements.
// Keep the existing function name for callers; coverage is based on ever_published.
export async function checkPublishedStockCoverage(db:Pick<Tx,'query'>,articles:string[]){
 const {rows}=await db.query(`SELECT p.sku FROM products p
  WHERE p.sku=ANY($1::text[]) AND p.ever_published`,[articles]);
 const published=new Set(rows.map(r=>r.sku));
 const invalid=articles.filter(sku=>!published.has(sku));
 return invalid;
}
