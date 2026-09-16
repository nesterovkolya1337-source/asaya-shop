import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Database,lock } from './db.js';
import { DomainError,canonical,hash } from './core.js';

const approvalSchema=z.object({
 schemaVersion:z.literal(1),scope:z.literal('storefront_to_catalog_mapping_only'),
 approvedOn:z.iso.date(),evidence:z.string().min(1),sourceSha256:z.string().regex(/^[a-f0-9]{64}$/),
 databaseApplied:z.boolean(),saleActivationApproved:z.literal(false),pricesApproved:z.literal(false),inventoryApproved:z.literal(false),
 mappings:z.array(z.object({slug:z.string().min(1),sku:z.string().min(1),status:z.literal('approved')}).strict()).min(1),
 pendingSlugs:z.array(z.string().min(1))
}).strict();

export function inspectApprovals(raw:unknown) {
 const record=approvalSchema.parse(raw);
 const slugs=record.mappings.map(m=>m.slug);
 if(new Set(slugs).size!==slugs.length || new Set(record.pendingSlugs).size!==record.pendingSlugs.length || slugs.some(s=>record.pendingSlugs.includes(s)))
  throw new DomainError('APPROVAL_SCOPE_CONFLICT',400);
 return record;
}

// Trusted local operator input; the manifest is a record of consent, not a signed credential.
export async function applyMappingApprovals(db:Database,raw:unknown) {
 const record=inspectApprovals(raw);
 return db.transaction(async tx=>{
  await lock(tx,'catalog:import');
  const run=(await tx.query('SELECT id FROM import_runs WHERE source_sha256=$1',[record.sourceSha256])).rows[0];
  if(!run) throw new DomainError('APPROVAL_SOURCE_NOT_IMPORTED');
  let applied=0,alreadyApproved=0;
  for(const mapping of [...record.mappings].sort((a,b)=>a.slug.localeCompare(b.slug))) {
   const row=(await tx.query(`SELECT m.approved,m.candidate_sku,m.product_id,p.sku,p.source_uuid
    FROM storefront_mappings m JOIN products p ON p.id=m.product_id
    WHERE m.slug=$1 FOR UPDATE OF m,p`,[mapping.slug])).rows[0];
   if(!row || row.sku!==mapping.sku || row.candidate_sku!==mapping.sku)
    throw new DomainError('APPROVAL_MAPPING_CHANGED');
   const source=(await tx.query(`SELECT 1 FROM import_rows WHERE run_id=$1 AND source_uuid=$2
    AND disposition='product_draft' AND raw->>'sku'=$3`,[run.id,row.source_uuid,mapping.sku])).rowCount;
   if(!source) throw new DomainError('APPROVAL_SOURCE_MISMATCH');
   if(row.approved){alreadyApproved++;continue;}
   await tx.query('UPDATE storefront_mappings SET approved=true WHERE slug=$1',[mapping.slug]);
   await tx.query(`INSERT INTO audit_log(id,action,entity_id,detail) VALUES($1,'catalog.mapping_approved',$2,$3)`,
    [randomUUID(),mapping.slug,JSON.stringify({sku:mapping.sku,approvedOn:record.approvedOn,evidence:record.evidence,
     sourceSha256:record.sourceSha256,manifestHash:hash(canonical(record))})]);
   applied++;
  }
  return {applied,alreadyApproved,pending:record.pendingSlugs.length,salesActivated:0};
 });
}
