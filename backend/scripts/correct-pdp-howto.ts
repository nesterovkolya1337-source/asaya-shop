import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {Database,lock} from '../src/db.js';
import {correctHowTo,type HowToCorrection} from '../src/pdp-howto-correction.js';
// Explicit content correction, dry-run by default. Not a startup hook or migration.
const actor=process.env.ADMIN_ACTOR_ID;
if(!actor||!process.env.DATABASE_URL)throw new Error('DATABASE_URL and ADMIN_ACTOR_ID required');
const db=new Database(process.env.DATABASE_URL),apply=process.argv.includes('--apply');
try{
 const patches=JSON.parse(await readFile('data/pdp-howto-corrections-20260925.json','utf8')) as HowToCorrection[];
 const result=await db.transaction(async tx=>{
  await lock(tx,'catalog:admin');
  if(!(await tx.query("SELECT 1 FROM users WHERE id=$1 AND role='admin' AND NOT disabled",[actor])).rowCount)throw new Error('FORBIDDEN');
  const report=[];
  for(const patch of patches){
   const r=(await tx.query(`SELECT p.id,e.draft,e.published FROM products p JOIN product_editor e ON e.product_id=p.id
    WHERE p.sku=$1 AND p.active AND p.archived_at IS NULL AND e.published IS NOT NULL FOR UPDATE OF p,e`,[patch.sku])).rows[0];
   if(!r){report.push({sku:patch.sku,status:'not_published'});continue;}
   const draft=correctHowTo(r.draft.content.pdp,patch),published=correctHowTo(r.published.content.pdp,patch);
   if([draft,published].some(v=>!['ready','already_corrected'].includes(v.status))){report.push({sku:patch.sku,draft:draft.status,published:published.status});continue;}
   if(apply&&[draft,published].some(v=>v.status==='ready')){
    await tx.query(`UPDATE product_editor SET draft=jsonb_set(draft,'{content,pdp}',$2::jsonb),published=jsonb_set(published,'{content,pdp}',$3::jsonb),revision=revision+1,updated_by=$4,updated_at=now() WHERE product_id=$1`,[r.id,JSON.stringify(draft.content),JSON.stringify(published.content),actor]);
    await tx.query('INSERT INTO audit_log(id,actor_id,action,entity_id,detail) VALUES($1,$2,$3,$4,$5)',[randomUUID(),actor,'product.howto_corrected',r.id,JSON.stringify({node:patch.node})]);
   }
   report.push({sku:patch.sku,status:apply?'corrected':'dry_run_ready'});
  }
  return report;
 });
 console.log(JSON.stringify(result,null,2));
}finally{await db.close();}
