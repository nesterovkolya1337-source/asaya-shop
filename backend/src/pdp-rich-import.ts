import {randomUUID} from 'node:crypto';
import {Database,lock} from './db.js';
import {parsePdpContent} from './pdp-content.js';
import {canonical,DomainError} from './core.js';

/** One-time content import. Changes only draft.content.pdp; never publishes. */
export async function importPdpRichContent(db:Database,raw:unknown,actor:string,apply=false){
 if(!Array.isArray(raw))throw new Error('INVALID_PDP_IMPORT');
 const entries=raw.map(e=>{if(!e||typeof e.sku!=='string'||Object.keys(e).some(k=>!['sku','pdp'].includes(k)))throw new Error('INVALID_PDP_IMPORT');return {sku:e.sku,pdp:parsePdpContent(e.pdp)};});
 if(new Set(entries.map(e=>e.sku)).size!==entries.length)throw new Error('DUPLICATE_PDP_SKU');
 return db.transaction(async tx=>{
  await lock(tx,'catalog:admin');
  if(!(await tx.query("SELECT 1 FROM users WHERE id=$1 AND role='admin' AND NOT disabled FOR SHARE",[actor])).rowCount)throw new DomainError('FORBIDDEN',403);
  const result=[];
  for(const entry of entries){
   const r=(await tx.query(`SELECT p.id,p.archived_at,e.draft FROM products p LEFT JOIN product_editor e ON e.product_id=p.id WHERE p.sku=$1 FOR UPDATE OF p`,[entry.sku])).rows[0];
   if(!r||r.archived_at||!r.draft?.content){result.push({sku:entry.sku,status:'missing_or_archived'});continue;}
   const prior=r.draft.content.pdp;
   if(prior&&canonical(prior)===canonical(entry.pdp)){result.push({sku:entry.sku,status:'already_imported'});continue;}
   if(prior?.sections?.length){result.push({sku:entry.sku,status:'existing_content_preserved'});continue;}
   if(apply){
    await tx.query(`UPDATE product_editor SET draft=jsonb_set(draft,'{content,pdp}',$2::jsonb),revision=revision+1,updated_by=$3,updated_at=now() WHERE product_id=$1`,[r.id,JSON.stringify(entry.pdp),actor]);
    await tx.query('INSERT INTO audit_log(id,actor_id,action,entity_id,detail) VALUES($1,$2,$3,$4,$5)',[randomUUID(),actor,'product.rich_content_imported',r.id,JSON.stringify({source:'pdp-rich-content-v2',node:entry.pdp.node})]);
   }
   result.push({sku:entry.sku,status:apply?'draft_imported':'ready'});
  }
  return result;
 });
}
