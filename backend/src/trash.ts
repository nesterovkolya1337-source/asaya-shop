
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {Database,lock,type Tx} from './db.js';
import {DomainError} from './core.js';
async function staff(tx:Tx,actor:string){if(!(await tx.query("SELECT 1 FROM users WHERE id=$1 AND role='admin' AND NOT disabled",[actor])).rowCount)throw new DomainError('FORBIDDEN',403);}
async function references(tx:Tx,id:string){
 const path='/api/store/v1/media/'+id;
 return !!(await tx.query(`SELECT 1 FROM product_editor e JOIN products p ON p.id=e.product_id
  WHERE (p.archived_at IS NULL OR p.ever_published) AND (strpos(e.draft::text,$1)>0 OR strpos(e.published::text,$1)>0)
  UNION ALL SELECT 1 FROM site_pages WHERE strpos(draft::text,$1)>0 OR strpos(published::text,$1)>0 LIMIT 1`,[path])).rowCount;
}
export class Trash {
 constructor(private db:Database){}

 async purge(actor:string|undefined,kind:'product'|'media',id:string,raw:unknown,expiredOnly=false){
  z.uuid().parse(id);z.object({confirmed:z.literal(true)}).strict().parse(raw);
  return this.db.transaction(async tx=>{
   if(actor)await staff(tx,actor);else if(!expiredOnly)throw new DomainError('FORBIDDEN',403);
   await lock(tx,'catalog:admin');
   const table=kind==='product'?'products':'product_media',field=kind==='product'?'archived_at':'deleted_at';
   const r=(await tx.query('SELECT '+field+' AS deleted_at FROM '+table+' WHERE id=$1 FOR UPDATE',[id])).rows[0];
   if(!r)return {ok:true};
   if(!r.deleted_at)throw new DomainError('NOT_IN_TRASH',409);
   if(expiredOnly&&+new Date(r.deleted_at)>Date.now()-30*86400000)return {ok:false};
   if(kind==='media'){
    await lock(tx,'media:'+id);if(await references(tx,id))throw new DomainError('ASSET_IN_USE',409);
    await tx.query('DELETE FROM product_media WHERE id=$1',[id]);
   }else{
    if((await tx.query('SELECT ever_published FROM products WHERE id=$1',[id])).rows[0].ever_published)throw new DomainError('PRODUCT_EVER_PUBLISHED',409);
    const used=(await tx.query(`SELECT 1 FROM order_items WHERE product_id=$1
     UNION ALL SELECT 1 FROM inventory_movements WHERE product_id=$1
     UNION ALL SELECT 1 FROM inventory_reservations WHERE product_id=$1
     UNION ALL SELECT 1 FROM product_analytics_events WHERE product_id=$1
     UNION ALL SELECT 1 FROM product_reviews WHERE product_id=$1
     UNION ALL SELECT 1 FROM product_components WHERE component_id=$1
     UNION ALL SELECT 1 FROM stock_source_items WHERE product_id=$1 LIMIT 1`,[id])).rowCount;
    if(used)throw new DomainError('PRODUCT_HISTORY_REQUIRES_RETENTION',409);
    for(const t of ['product_editor','product_prices','product_external_ids','product_barcodes','storefront_mappings','product_components','inventory_balances'])await tx.query('DELETE FROM '+t+' WHERE product_id=$1',[id]);
    await tx.query('DELETE FROM products WHERE id=$1',[id]);
   }
   await tx.query("INSERT INTO audit_log(id,actor_id,action,entity_id,detail) VALUES($1,$2,'trash.purged',$3,$4)",[randomUUID(),actor??null,id,{kind}]);
   return {ok:true};
  });
 }
 async cleanup(){
  const rows=(await this.db.pool.query(`SELECT 'product' kind,id FROM products WHERE NOT ever_published AND archived_at<=now()-interval '30 days'
   UNION ALL SELECT 'media',id FROM product_media WHERE deleted_at<=now()-interval '30 days' LIMIT 100`)).rows;
  let count=0;
  for(const r of rows){try{if((await this.purge(undefined,r.kind,r.id,{confirmed:true},true)).ok)count++;}
   catch(e){if(!(e instanceof DomainError)||!['ASSET_IN_USE','PRODUCT_HISTORY_REQUIRES_RETENTION','PRODUCT_EVER_PUBLISHED'].includes(e.code))throw e;}}
  return count;
 }
 async list(actor:string){
  return this.db.transaction(async tx=>{await staff(tx,actor);return {items:(await tx.query(`SELECT 'product' kind,id,name,archived_at deleted_at,deleted_by,
   CASE WHEN ever_published THEN NULL ELSE greatest(0,ceil(extract(epoch FROM archived_at+interval '30 days'-now())/86400))::int END days_left,ever_published FROM products WHERE archived_at IS NOT NULL
   UNION ALL SELECT 'media',id,id::text,deleted_at,deleted_by,greatest(0,ceil(extract(epoch FROM deleted_at+interval '30 days'-now())/86400))::int,false FROM product_media WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC`)).rows};});
 }
 async assets(actor:string){
  return this.db.transaction(async tx=>{await staff(tx,actor);return {items:(await tx.query('SELECT id,created_at FROM product_media WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 200')).rows};});
 }
 async deleteMedia(actor:string,id:string){
  z.uuid().parse(id);return this.db.transaction(async tx=>{
   await staff(tx,actor);await lock(tx,'catalog:admin');await lock(tx,'media:'+id);
   if(await references(tx,id))throw new DomainError('ASSET_IN_USE',409);
   if(!(await tx.query('UPDATE product_media SET deleted_at=COALESCE(deleted_at,now()),deleted_by=COALESCE(deleted_by,$2) WHERE id=$1',[id,actor])).rowCount)throw new DomainError('MEDIA_NOT_FOUND',404);
   await tx.query("INSERT INTO audit_log(id,actor_id,action,entity_id,detail) VALUES($1,$2,'media.deleted',$3,'{}')",[randomUUID(),actor,id]);
   return {ok:true};
  });
 }
 async restore(actor:string,kind:'product'|'media',id:string){
  z.uuid().parse(id);return this.db.transaction(async tx=>{
   await staff(tx,actor);await lock(tx,'catalog:admin');
   const r=kind==='product'?await tx.query('UPDATE products SET archived_at=NULL,deleted_by=NULL,deleted_from=NULL,active=false,sale_approved=false WHERE id=$1 AND archived_at IS NOT NULL RETURNING id',[id]):await tx.query('UPDATE product_media SET deleted_at=NULL,deleted_by=NULL WHERE id=$1 AND deleted_at IS NOT NULL RETURNING id',[id]);
   if(!r.rowCount)throw new DomainError('TRASH_NOT_FOUND',404);
   await tx.query("INSERT INTO audit_log(id,actor_id,action,entity_id,detail) VALUES($1,$2,'trash.restored',$3,$4)",[randomUUID(),actor,id,{kind}]);return {ok:true};
  });
 }
}
