import {parseImageCrop} from './image-crop.js';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {Database,type Tx,lock} from './db.js';
import {DomainError,money} from './core.js';
import {publicationIssues} from './publication-issues.js';
const text=(max:number)=>z.string().trim().max(max);
const mediaPath=/^\/api\/store\/v1\/media\/([a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/;
const image=text(1000).refine(v=>v===''||mediaPath.test(v)||/^\/images\/[A-Za-z0-9_./-]+$/.test(v)&&!v.includes('..')||/^https:\/\/[^\s]+$/.test(v)&&(()=>{try{const u=new URL(v);return !u.username&&!u.password;}catch{return false;}})());
export const contentSchema=z.object({
 imageCrops:z.record(image,z.string().max(500).refine(v=>{try{return !!parseImageCrop(v);}catch{return false;}})).refine(v=>Object.keys(v).length<=50).optional(),
 size:z.object({value:z.number().positive().max(1000000),unit:z.enum(['ml','g','pcs'])}).strict().optional(),
 placement:z.object({catalogOrder:z.number().int().min(0).max(100000),bestsellerOrder:z.number().int().min(0).max(100000).nullable(),newOrder:z.number().int().min(0).max(100000).nullable()}).strict().optional(),
 description:text(10000),volume:text(200),category:z.enum(['hair','body','face','sets']),setKind:z.enum(['none','combo','gift']),
 usage:text(10000),ingredients:text(10000),aroma:text(2000),features:z.array(text(300)).max(20),
 image,gallery:z.array(image).max(12),badge:z.enum(['','Бестселлер','Новинка','Выбор ASAYA','Лимитированная серия']),
 instruction:z.object({steps:z.array(text(1000)).max(20),amount:text(2000),tip:text(3000)}).strict(),
 safety:text(3000),recommendations:z.array(z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/)).max(20),
 sensory:z.array(z.object({label:text(200),value:z.number().int().min(0).max(5)}).strict()).max(10)
}).strict();
export const emptyContent=contentSchema.parse({description:'',volume:'',category:'hair',setKind:'none',usage:'',ingredients:'',aroma:'',features:[],image:'',gallery:[],badge:'',instruction:{steps:[],amount:'',tip:''},safety:'',recommendations:[],sensory:[]});
const amount=z.number().int().min(0).max(1_000_000_000_000).nullable();
export const draftSchema=z.object({
 revision:z.number().int().min(0),sku:z.string().trim().max(100),name:text(300),
 slug:text(80).refine(v=>v===''||/^[a-z0-9][a-z0-9-]{0,79}$/.test(v)),
 content:contentSchema,regularMinor:amount,finalMinor:amount,
 weightG:z.number().int().positive().max(1000000).nullable(),widthMm:z.number().int().positive().max(10000).nullable(),
 heightMm:z.number().int().positive().max(10000).nullable(),depthMm:z.number().int().positive().max(10000).nullable()
}).strict();
async function admin(tx:Tx,actor:string){
 if(!(await tx.query("SELECT 1 FROM users WHERE id=$1 AND role='admin' AND NOT disabled FOR SHARE",[actor])).rowCount)throw new DomainError('FORBIDDEN',403);
}
async function checkMedia(tx:Tx,content:z.infer<typeof contentSchema>){
 const ids=[...new Set([content.image,...content.gallery].flatMap(v=>{const m=v.match(mediaPath);return m?[m[1]!]:[];}))];
 if(ids.length&&(await tx.query('SELECT id FROM product_media WHERE id=ANY($1::uuid[])',[ids])).rowCount!==ids.length)throw new DomainError('MEDIA_REFERENCE_MISSING',400);
}
async function audit(tx:Tx,actor:string,action:string,id:string,detail:unknown){
 await tx.query('INSERT INTO audit_log(id,actor_id,action,entity_id,detail) VALUES($1,$2,$3,$4,$5)',[randomUUID(),actor,action,id,JSON.stringify(detail)]);
}
export async function writePublished(tx:Tx,id:string,d:z.infer<typeof draftSchema>,e:{published?:{slug:string}|null}){
   if(e.published&&e.published.slug!==d.slug)throw new DomainError('SLUG_IMMUTABLE');
   const mapping=(await tx.query('SELECT product_id FROM storefront_mappings WHERE slug=$1 FOR UPDATE',[d.slug])).rows[0];
   if(mapping?.product_id&&mapping.product_id!==id)throw new DomainError('SLUG_IN_USE');
   await tx.query('UPDATE products SET name=$2,active=true,sale_approved=true,weight_g=$3,width_mm=$4,height_mm=$5,depth_mm=$6,updated_at=now() WHERE id=$1',[id,d.name,d.weightG,d.widthMm,d.heightMm,d.depthMm]);
   await tx.query(`INSERT INTO product_prices(product_id,currency,regular_minor,final_minor,approved) VALUES($1,'RUB',$2,$3,true)
    ON CONFLICT(product_id) DO UPDATE SET regular_minor=excluded.regular_minor,final_minor=excluded.final_minor,approved=true`,[id,d.regularMinor,d.finalMinor]);
   await tx.query('UPDATE storefront_mappings SET approved=false WHERE product_id=$1',[id]);
   await tx.query(`INSERT INTO storefront_mappings(slug,candidate_sku,product_id,confidence,approved,reason) VALUES($1,$2,$3,'high',true,'Published by administrator')
    ON CONFLICT(slug) DO UPDATE SET candidate_sku=excluded.candidate_sku,product_id=excluded.product_id,approved=true,reason=excluded.reason`,[d.slug,d.sku,id]);
}
export class AdminCatalog{
 constructor(private db:Database){}
 async list(raw:unknown){
  const {search,offset,category}=z.object({search:text(100).default(''),category:z.enum(['','hair','body','face','sets']).default(''),offset:z.coerce.number().int().min(0).max(1000000).default(0)}).strict().parse(raw);
  const r=await this.db.pool.query(`SELECT p.id,p.sku,COALESCE(e.draft->>'name',p.name) AS name,p.active,
   CASE WHEN p.archived_at IS NOT NULL THEN 'deleted' WHEN p.active THEN 'published' WHEN e.published_at IS NOT NULL THEN 'unpublished' ELSE 'draft' END AS lifecycle,
   COALESCE(e.revision,0) AS revision,COALESCE(e.draft->'content'->>'category','') AS category,COALESCE(e.draft->'content'->>'image','') AS image FROM products p LEFT JOIN product_editor e ON e.product_id=p.id
   WHERE (p.sku ILIKE $1 OR p.name ILIKE $1 OR e.draft->>'name' ILIKE $1) AND ($3='' OR e.draft->'content'->>'category'=$3) ORDER BY p.sku,p.id LIMIT 51 OFFSET $2`,['%'+search.replace(/[\\%_]/g,'\\$&')+'%',offset,category]);
  return {items:r.rows.slice(0,50),nextOffset:r.rows.length>50?offset+50:null};
 }
 async detail(id:string){
  z.uuid().parse(id);
  const r=(await this.db.pool.query(`SELECT p.*,e.draft,e.revision,e.published,e.published_at,
   pr.regular_minor,pr.final_minor,(SELECT slug FROM storefront_mappings WHERE product_id=p.id ORDER BY approved DESC,slug LIMIT 1) AS slug
   FROM products p LEFT JOIN product_editor e ON e.product_id=p.id LEFT JOIN product_prices pr ON pr.product_id=p.id WHERE p.id=$1`,[id])).rows[0];
  if(!r)throw new DomainError('PRODUCT_NOT_FOUND',404);
  const stocks=(await this.db.pool.query(`SELECT w.id AS warehouseId,w.name,w.active,COALESCE(b.on_hand,0) AS on_hand,COALESCE(b.reserved,0) AS reserved,
   s.generated_at,s.fetched_at,s.expires_at,s.healthy,s.warehouse_id IS NOT NULL AS managed,COALESCE(i.provider_quantity,0) AS provider_quantity,
   GREATEST(0,LEAST(COALESCE(b.on_hand,0),asaya_stock_limit($1,w.id,true))-COALESCE(b.reserved,0)) AS available
   FROM warehouses w LEFT JOIN inventory_balances b ON b.warehouse_id=w.id AND b.product_id=$1
   LEFT JOIN stock_sources s ON s.warehouse_id=w.id LEFT JOIN stock_source_items i ON i.warehouse_id=w.id AND i.product_id=$1
   ORDER BY w.code`,[id])).rows.map(r=>({warehouseId:r.warehouseid,name:r.name,active:r.active,onHand:r.on_hand,reserved:r.reserved,
    source:r.managed?{kind:'cdek_ff_yml',generatedAt:r.generated_at,fetchedAt:r.fetched_at,expiresAt:r.expires_at,healthy:r.healthy,available:r.available,reportedQuantity:r.provider_quantity}:null}));
  const draft=r.draft??{sku:r.sku,name:r.name,slug:r.slug??'',content:emptyContent,regularMinor:r.regular_minor===null?null:money(r.regular_minor),finalMinor:r.final_minor===null?null:money(r.final_minor),
   weightG:r.weight_g,widthMm:r.width_mm,heightMm:r.height_mm,depthMm:r.depth_mm};
  return {id,revision:r.revision??0,lifecycle:r.archived_at?'deleted':r.active?'published':r.published_at?'unpublished':'draft',active:r.active,hasDraft:!!r.draft,publishedAt:r.published_at,draft,stocks};
 }
 async save(actor:string,id:string,raw:unknown){
  z.uuid().parse(id);const input=draftSchema.parse(raw);const {revision,...draft}=input;
  if(draft.content.size){const s=draft.content.size;draft.content.volume=String(s.value)+' '+({ml:'мл',g:'г',pcs:'шт.'}[s.unit]);}
  try{return await this.db.transaction(async tx=>{
   await admin(tx,actor);await lock(tx,'catalog:admin');
   await checkMedia(tx,draft.content);
   const p=(await tx.query('SELECT sku,active,archived_at FROM products WHERE id=$1 FOR UPDATE',[id])).rows[0];
   const editor=(await tx.query('SELECT revision,published_at,published FROM product_editor WHERE product_id=$1 FOR UPDATE',[id])).rows[0];
   if((editor?.revision??0)!==revision)throw new DomainError('EDIT_CONFLICT');
   if(p?.archived_at)throw new DomainError('PRODUCT_ARCHIVED');
   draft.sku ||= p?.sku ?? 'ASAYA-'+id;
   draft.slug ||= editor?.published?.slug ?? 'product-'+id;
   draft.regularMinor ??= draft.finalMinor; draft.finalMinor ??= draft.regularMinor;
   draft.content.image ||= draft.content.gallery.find(v=>v.trim()) ?? '';
   if(p?.active){const issues=publicationIssues(draft);if(issues.length)throw new DomainError('PUBLISHED_REQUIRED_'+issues[0]);}
   if(p&&p.sku!==draft.sku){
    if(p.active||editor?.published_at||(await tx.query('SELECT 1 FROM order_items WHERE product_id=$1 UNION ALL SELECT 1 FROM product_external_ids WHERE product_id=$1 UNION ALL SELECT 1 FROM inventory_reservations WHERE product_id=$1 UNION ALL SELECT 1 FROM stock_source_items WHERE product_id=$1 AND listed LIMIT 1',[id])).rowCount)throw new DomainError('SKU_IMMUTABLE');
    await tx.query('UPDATE products SET sku=$2,updated_at=now() WHERE id=$1',[id,draft.sku]);
    await audit(tx,actor,'product.sku_corrected',id,{before:p.sku,after:draft.sku});
   }
   if(!p){
    if(revision!==0)throw new DomainError('EDIT_CONFLICT');
    await tx.query("INSERT INTO products(id,sku,name) VALUES($1,$2,$3)",[id,draft.sku,draft.name||'Новый товар']);
   }
   await tx.query(`INSERT INTO product_editor(product_id,revision,draft,updated_by) VALUES($1,1,$2,$3)
    ON CONFLICT(product_id) DO UPDATE SET revision=product_editor.revision+1,draft=excluded.draft,updated_by=excluded.updated_by,updated_at=now()`,[id,JSON.stringify(draft),actor]);
   if(p?.active){
    await writePublished(tx,id,{...draft,revision},editor??{});
    await tx.query('UPDATE product_editor SET published=draft WHERE product_id=$1',[id]);
   }
   await audit(tx,actor,p?.active?'product.saved':'product.draft_saved',id,{revision:revision+1});
   return {id,revision:revision+1};
  });}catch(e){if((e as {code?:string}).code==='23505')throw new DomainError('SKU_IN_USE');throw e;}
 }
 async publish(actor:string,id:string,raw:unknown){
  z.uuid().parse(id);const {revision}=z.object({revision:z.number().int().positive()}).strict().parse(raw);
  try{return await this.db.transaction(async tx=>{
   await admin(tx,actor);await lock(tx,'catalog:admin');
   const p=(await tx.query('SELECT * FROM products WHERE id=$1 FOR UPDATE',[id])).rows[0];
   const e=(await tx.query('SELECT * FROM product_editor WHERE product_id=$1 FOR UPDATE',[id])).rows[0];
   if(!p||!e)throw new DomainError('PRODUCT_NOT_FOUND',404);
   if(e.revision!==revision)throw new DomainError('EDIT_CONFLICT');
   if(p.archived_at)throw new DomainError('PRODUCT_ARCHIVED');
   const d=draftSchema.parse({...e.draft,revision});await checkMedia(tx,d.content);
   if(publicationIssues(d).length)throw new DomainError('PUBLISH_INCOMPLETE');
   await writePublished(tx,id,d,e);
   await tx.query('UPDATE product_editor SET published=draft,published_at=now(),revision=revision+1,updated_by=$2,updated_at=now() WHERE product_id=$1',[id,actor]);
   await audit(tx,actor,'product.published',id,{revision:revision+1,slug:d.slug,regularMinor:d.regularMinor,finalMinor:d.finalMinor});
   return {id,revision:revision+1};
  });}catch(e){if((e as {code?:string}).code==='23505')throw new DomainError('SLUG_IN_USE');throw e;}
 }
 async unpublish(actor:string,id:string,raw:unknown){
  z.uuid().parse(id);const {revision}=z.object({revision:z.number().int().nonnegative()}).strict().parse(raw);
  return this.db.transaction(async tx=>{
   await admin(tx,actor);await lock(tx,'catalog:admin');
   if(!(await tx.query('SELECT 1 FROM products WHERE id=$1 FOR UPDATE',[id])).rowCount)throw new DomainError('PRODUCT_NOT_FOUND',404);
   const e=(await tx.query('SELECT revision FROM product_editor WHERE product_id=$1 FOR UPDATE',[id])).rows[0];
   if((e?.revision??0)!==revision)throw new DomainError('EDIT_CONFLICT');
   await tx.query('UPDATE products SET active=false,sale_approved=false,updated_at=now() WHERE id=$1',[id]);
   await tx.query('UPDATE product_editor SET revision=revision+1,updated_by=$2,updated_at=now() WHERE product_id=$1',[id,actor]);
   await audit(tx,actor,'product.unpublished',id,{revision:revision+(e?1:0)});return {ok:true};
  });
 }
 async remove(actor:string,id:string,raw:unknown){
  z.uuid().parse(id);const input=z.object({revision:z.number().int().nonnegative(),confirmed:z.literal(true),sku:z.string().min(1).max(100)}).strict().parse(raw);
  return this.db.transaction(async tx=>{
   await admin(tx,actor);await lock(tx,'catalog:admin');
   const p=(await tx.query('SELECT * FROM products WHERE id=$1 FOR UPDATE',[id])).rows[0],e=(await tx.query('SELECT * FROM product_editor WHERE product_id=$1 FOR UPDATE',[id])).rows[0];
   if(!p)throw new DomainError('PRODUCT_NOT_FOUND',404);
   if((e?.revision??0)!==input.revision||p.sku!==input.sku)throw new DomainError('EDIT_CONFLICT');
   const used=!e||p.active||p.source_uuid||e.published_at||(await tx.query(`SELECT 1 FROM order_items WHERE product_id=$1 UNION ALL SELECT 1 FROM inventory_movements WHERE product_id=$1
    UNION ALL SELECT 1 FROM inventory_reservations WHERE product_id=$1 UNION ALL SELECT 1 FROM inventory_balances WHERE product_id=$1
    UNION ALL SELECT 1 FROM product_external_ids WHERE product_id=$1 UNION ALL SELECT 1 FROM product_barcodes WHERE product_id=$1
    UNION ALL SELECT 1 FROM storefront_mappings WHERE product_id=$1 UNION ALL SELECT 1 FROM stock_source_items WHERE product_id=$1
    UNION ALL SELECT 1 FROM product_components WHERE product_id=$1 OR component_id=$1 LIMIT 1`,[id])).rowCount;
   if(used){await tx.query('UPDATE products SET active=false,sale_approved=false,archived_at=now(),updated_at=now() WHERE id=$1',[id]);await tx.query('UPDATE product_editor SET revision=revision+1,updated_by=$2,updated_at=now() WHERE product_id=$1',[id,actor]);}
   else {await tx.query('DELETE FROM product_editor WHERE product_id=$1',[id]);await tx.query('DELETE FROM product_prices WHERE product_id=$1',[id]);await tx.query('DELETE FROM products WHERE id=$1',[id]);}
   const outcome=used?'archived':'deleted';await audit(tx,actor,'product.'+outcome,id,{});return {outcome};
  });
 }
 async stock(actor:string,id:string,raw:unknown){
  z.uuid().parse(id);const d=z.object({warehouseId:z.uuid(),expectedOnHand:z.number().int().nonnegative(),onHand:z.number().int().min(0).max(1000000)}).strict().parse(raw);
  return this.db.transaction(async tx=>{
   await admin(tx,actor);
   if(!(await tx.query('SELECT 1 FROM products WHERE id=$1 FOR UPDATE',[id])).rowCount)throw new DomainError('PRODUCT_NOT_FOUND',404);
   if(!(await tx.query('SELECT 1 FROM warehouses WHERE id=$1 AND active FOR SHARE',[d.warehouseId])).rowCount)throw new DomainError('WAREHOUSE_UNAVAILABLE');
   if((await tx.query('SELECT 1 FROM stock_sources WHERE warehouse_id=$1',[d.warehouseId])).rowCount)throw new DomainError('STOCK_MANAGED_BY_PROVIDER');
   const prior=(await tx.query('SELECT * FROM inventory_balances WHERE product_id=$1 AND warehouse_id=$2 FOR UPDATE',[id,d.warehouseId])).rows[0];
   const old=prior?.on_hand??0,reserved=prior?.reserved??0;
   if(old!==d.expectedOnHand)throw new DomainError('STOCK_CONFLICT');
   if(d.onHand<reserved)throw new DomainError('STOCK_RESERVED');
   await tx.query('INSERT INTO inventory_balances(product_id,warehouse_id,on_hand) VALUES($1,$2,$3) ON CONFLICT(product_id,warehouse_id) DO UPDATE SET on_hand=excluded.on_hand',[id,d.warehouseId,d.onHand]);
   if(old!==d.onHand)await tx.query('INSERT INTO inventory_movements(id,product_id,warehouse_id,kind,quantity) VALUES($1,$2,$3,$4,$5)',[randomUUID(),id,d.warehouseId,d.onHand>old?'adjustment_in':'adjustment_out',Math.abs(d.onHand-old)]);
   await audit(tx,actor,'inventory.adjusted',id,{warehouseId:d.warehouseId,before:old,after:d.onHand,reserved});return {ok:true};
  });
 }
 async history(id:string){z.uuid().parse(id);return {items:(await this.db.pool.query('SELECT action,actor_id,detail,created_at FROM audit_log WHERE entity_id=$1 ORDER BY created_at DESC,id DESC LIMIT 50',[id])).rows};}
}
