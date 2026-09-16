import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Database,lock } from './db.js';
import { DomainError } from './core.js';
const sourceSchema=z.object({sourceName:z.string().min(1),sourceSha256:z.string().regex(/^[a-f0-9]{64}$/),rows:z.array(z.object({
 // Source GUIDs use a non-RFC variant (e.g. ...-0a80-...). PostgreSQL accepts the 128-bit value.
 rowNumber:z.number().int().min(2),group:z.string(),sourceUuid:z.string().regex(/^[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}$/).toLowerCase(),sourceCode:z.string().min(1),name:z.string().min(1),
 externalCode:z.string().min(1),sku:z.string().nullable(),barcodesRaw:z.string().nullable()
}).strict()).min(1)}).strict();
const mappingsSchema=z.array(z.object({slug:z.string().min(1),candidateSku:z.string().nullable(),confidence:z.enum(['high','medium','low','unmatched']),reason:z.string()}));
export function validEan(code:string) {
 return /^\d{13}$/.test(code)&&[...code].reduce((sum,n,i)=>sum+Number(n)*(i%2?3:1),0)%10===0;
}
export function inspectImport(raw:unknown,mappingRaw:unknown) {
 const data=sourceSchema.parse(raw);const mappings=mappingsSchema.parse(mappingRaw);
 for(const key of ['rowNumber','sourceUuid','sourceCode','externalCode','sku'] as const) {
  const values=data.rows.map(r=>r[key]).filter(v=>v!==null&&v!=='');
  if(new Set(values).size!==values.length) throw new DomainError(`DUPLICATE_${key}`,400);
 }
 if(new Set(mappings.map(m=>m.slug)).size!==mappings.length) throw new DomainError('DUPLICATE_SLUG',400);
 const allCodes=new Set<string>();
 const rows=data.rows.map(row=>{
  const barcodes=(row.barcodesRaw??'').trim().split(/\s+/).filter(Boolean);
  for(const code of barcodes){if(!validEan(code)||allCodes.has(code))throw new DomainError('INVALID_OR_DUPLICATE_EAN',400);allCodes.add(code);}
  const sellable=row.group.startsWith('Продукция/');
  if(sellable&&!row.sku)throw new DomainError('PRODUCT_WITHOUT_SKU',400);
  return {...row,barcodes,sellable};
 });
 for(const m of mappings)if(m.candidateSku&&!rows.some(r=>r.sellable&&r.sku===m.candidateSku)) throw new DomainError('MAPPING_TARGET_MISSING',400);
 const report={rows:rows.length,products:rows.filter(r=>r.sellable).length,excluded:rows.filter(r=>!r.sellable).length,
  barcodes:allCodes.size,storefrontMappings:mappings.length,approvedForSale:0,
  unresolved:mappings.filter(m=>m.confidence!=='high').map(m=>m.slug)};
 return {data,rows,mappings,report};
}
export async function importCatalog(db:Database,raw:unknown,mappingRaw:unknown) {
 const {data,rows,mappings,report}=inspectImport(raw,mappingRaw);
 return db.transaction(async tx=>{
  await lock(tx,'catalog:import');
  const prior=(await tx.query('SELECT id FROM import_runs WHERE source_sha256=$1',[data.sourceSha256])).rows[0];
  if(prior)return {...report,replayed:true};
  const runId=randomUUID();
  await tx.query('INSERT INTO import_runs(id,source_sha256,source_name,row_count) VALUES($1,$2,$3,$4)',[runId,data.sourceSha256,data.sourceName,rows.length]);
  for(const row of rows) {
   await tx.query('INSERT INTO import_rows(run_id,row_number,source_uuid,raw,disposition) VALUES($1,$2,$3,$4,$5)',[runId,row.rowNumber,row.sourceUuid,JSON.stringify(row),row.sellable?'product_draft':'reference_only']);
   if(!row.sellable)continue;
   const priorProduct=(await tx.query('SELECT id,sku FROM products WHERE source_uuid=$1',[row.sourceUuid])).rows[0];
   if(priorProduct&&priorProduct.sku!==row.sku)throw new DomainError('SOURCE_SKU_CHANGED');
   const productId=priorProduct?.id??randomUUID();
   // Approved commercial fields and storefront copy are never overwritten by an import.
   await tx.query(`INSERT INTO products(id,sku,name,source_uuid,source_code,source_external_code)
    VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(source_uuid) DO UPDATE SET source_code=excluded.source_code,
    source_external_code=excluded.source_external_code,updated_at=now()`,[productId,row.sku,row.name,row.sourceUuid,row.sourceCode,row.externalCode]);
   for(const code of row.barcodes) {
    const owner=(await tx.query('SELECT product_id FROM product_barcodes WHERE barcode=$1',[code])).rows[0];
    if(owner&&owner.product_id!==productId)throw new DomainError('BARCODE_OWNER_CHANGED');
    await tx.query('INSERT INTO product_barcodes(product_id,barcode) VALUES($1,$2) ON CONFLICT DO NOTHING',[productId,code]);
   }
  }
  for(const m of mappings) await tx.query(`INSERT INTO storefront_mappings(slug,candidate_sku,product_id,confidence,reason)
   VALUES($1,$2,(SELECT id FROM products WHERE sku=$2),$3,$4) ON CONFLICT(slug) DO NOTHING`,[m.slug,m.candidateSku,m.confidence,m.reason]);
  return {...report,replayed:false};
 });
}
