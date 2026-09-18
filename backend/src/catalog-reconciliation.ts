import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {Database,lock} from './db.js';
import {canonical,hash,DomainError} from './core.js';
import {draftSchema,writePublished} from './admin-catalog.js';
import {publicationIssues} from './publication-issues.js';

const entrySchema=z.object({id:z.uuid(),sku:z.string().min(1),expectedHash:z.string().regex(/^[a-f0-9]{64}$/),previousMappingProductId:z.uuid().nullable().optional(),draft:draftSchema,sourceUrl:z.url(),sourceSha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export const reconciliationSchema=z.object({version:z.literal(1),entries:z.array(entrySchema).min(1).max(100)}).strict();
// A reviewed, SKU-bound snapshot is required. This is an operator tool, not a
// startup migration: it cannot turn every imported draft into a live product.
export async function reconcilePublishedCatalog(db:Database,raw:unknown,apply=false){
 const plan=reconciliationSchema.parse(raw),planHash=hash(canonical(plan));
 if(new Set(plan.entries.map(e=>e.id)).size!==plan.entries.length||new Set(plan.entries.map(e=>e.sku)).size!==plan.entries.length)throw new DomainError('DUPLICATE_SKU');
 return db.transaction(async tx=>{
  await lock(tx,'catalog:admin');
  const results=[];
  for(const entry of plan.entries){
   const prior=(await tx.query("SELECT 1 FROM audit_log WHERE entity_id=$1 AND action='product.publication_restored' AND detail->>'planHash'=$2",[entry.id,planHash])).rowCount;
   if(prior){results.push({sku:entry.sku,status:'already_applied'});continue;}
   const p=(await tx.query('SELECT id,sku,name,active,sale_approved,archived_at,weight_g,width_mm,height_mm,depth_mm FROM products WHERE id=$1 FOR UPDATE',[entry.id])).rows[0];
   const editor=(await tx.query('SELECT revision,draft,published FROM product_editor WHERE product_id=$1 FOR UPDATE',[entry.id])).rows[0]??null;
   const price=(await tx.query('SELECT currency,regular_minor,final_minor,approved FROM product_prices WHERE product_id=$1 FOR UPDATE',[entry.id])).rows[0]??null;
   if(!p||p.sku!==entry.sku||p.archived_at||hash(canonical({product:p,editor,price}))!==entry.expectedHash)throw new DomainError('RECONCILIATION_CONFLICT');
   const d=entry.draft;
   if(d.sku!==p.sku||!d.slug||new URL(entry.sourceUrl).origin!=='https://asaya.ru'||new URL(entry.sourceUrl).pathname!=='/product/'+d.slug+'/')throw new DomainError('RECONCILIATION_SOURCE');
   if(publicationIssues(d).length)throw new DomainError('PUBLISH_INCOMPLETE');
   if(price&&(Number(price.regular_minor)!==d.regularMinor||Number(price.final_minor)!==d.finalMinor))throw new DomainError('RECONCILIATION_PRICE_CONFLICT');
   if([d.weightG,d.widthMm,d.heightMm,d.depthMm].some((v,i)=>v!==[p.weight_g,p.width_mm,p.height_mm,p.depth_mm][i]))throw new DomainError('RECONCILIATION_LOGISTICS_CONFLICT');
   const mapping=(await tx.query('SELECT product_id,candidate_sku,approved FROM storefront_mappings WHERE slug=$1 FOR UPDATE',[d.slug])).rows[0];
   const alreadyMapped=mapping?.product_id===p.id&&mapping.candidate_sku===p.sku&&mapping.approved;
   if(!alreadyMapped){
    if(entry.previousMappingProductId===undefined||!mapping||mapping.product_id!==entry.previousMappingProductId)throw new DomainError('RECONCILIATION_MAPPING');
    if(mapping.product_id&&mapping.product_id!==p.id&&(await tx.query('SELECT 1 FROM products WHERE id=$1 AND active UNION ALL SELECT 1 FROM order_items WHERE product_id=$1 LIMIT 1',[mapping.product_id])).rowCount)throw new DomainError('RECONCILIATION_MAPPING_IN_USE');
   }
   if(apply){
    if(!alreadyMapped)await tx.query('UPDATE storefront_mappings SET product_id=$2,candidate_sku=$3,approved=true WHERE slug=$1',[d.slug,p.id,p.sku]);
    await writePublished(tx,p.id,d,editor??{});
    const {revision,...content}=d;
    await tx.query(`INSERT INTO product_editor(product_id,revision,draft,published,published_at) VALUES($1,1,$2,$2,now())
     ON CONFLICT(product_id) DO UPDATE SET revision=product_editor.revision+1,draft=$2,published=$2,published_at=COALESCE(product_editor.published_at,now()),updated_at=now()`,[p.id,JSON.stringify(content)]);
    await tx.query("INSERT INTO audit_log(id,action,entity_id,detail) VALUES($1,'product.publication_restored',$2,$3)",[randomUUID(),p.id,JSON.stringify({planHash,sourceUrl:entry.sourceUrl,sourceSha256:entry.sourceSha256,previous:{product:p,editor,price}})]);
   }
   results.push({sku:entry.sku,status:apply?'restored':'ready'});
  }
  return {planHash,apply,results};
 });
}
