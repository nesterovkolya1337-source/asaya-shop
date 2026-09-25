import {z} from 'zod';
import {randomUUID} from 'node:crypto';
import {Database,lock} from './db.js';
import {DomainError,money} from './core.js';
const scope=z.enum(['catalog','hair','body','face','sets','recommendations','home_bestsellers','home_new']);
export class AdminMerchandising{
 constructor(private db:Database){}
 async read(){return {items:(await this.db.pool.query('SELECT scope,revision,value FROM merchandising ORDER BY scope')).rows};}
 async save(actor:string,raw:unknown){
  const d=z.object({scope,revision:z.number().int().nonnegative(),value:z.union([z.array(z.string().min(1).max(100)).max(5000),z.record(z.string().min(1).max(100),z.string().min(1).max(100))])}).strict().parse(raw);
  return this.db.transaction(async tx=>{
   if(!(await tx.query("SELECT 1 FROM users WHERE id=$1 AND role='admin' AND NOT disabled",[actor])).rowCount)throw new DomainError('FORBIDDEN',403);
   await lock(tx,'catalog:admin');
   const prior=(await tx.query('SELECT revision,value FROM merchandising WHERE scope=$1 FOR UPDATE',[d.scope])).rows[0];
   if(!prior||prior.revision!==d.revision)throw new DomainError('EDIT_CONFLICT');
   const rows=(await tx.query(`SELECT p.sku,e.published->'content'->>'category' AS category,
    COALESCE((SELECT sum(GREATEST(0,LEAST(b.on_hand,asaya_stock_limit(p.id,b.warehouse_id,true))-b.reserved)) FROM inventory_balances b JOIN warehouses w ON w.id=b.warehouse_id WHERE b.product_id=p.id AND w.active),0)::integer AS available
    FROM products p JOIN product_editor e ON e.product_id=p.id WHERE p.active AND p.archived_at IS NULL AND e.published IS NOT NULL`)).rows;
   const bySku=new Map(rows.map(r=>[r.sku,r]));
   if(d.scope==='recommendations'){
    if(Array.isArray(d.value))throw new DomainError('INVALID_INPUT',400);
    for(const [from,to] of Object.entries(d.value)){
     // Retain inactive saved references, but never allow a new invalid assignment.
     if(prior.value[from]===to)continue;
     if(from===to||!bySku.has(from)||!bySku.has(to)||bySku.get(to)!.available<1)throw new DomainError('RECOMMENDATION_UNAVAILABLE',400);
    }
   }else{
    if(!Array.isArray(d.value)||new Set(d.value).size!==d.value.length)throw new DomainError('INVALID_INPUT',400);
    for(const sku of d.value){const p=bySku.get(sku);if(!p){if(Array.isArray(prior.value)&&prior.value.includes(sku))continue;throw new DomainError('PRODUCT_UNAVAILABLE',400);}if(!['catalog','home_bestsellers','home_new'].includes(d.scope)&&p.category!==d.scope)throw new DomainError('CATEGORY_MISMATCH',400);}
   }
   await tx.query('UPDATE merchandising SET value=$2,revision=revision+1,updated_by=$3,updated_at=now() WHERE scope=$1',[d.scope,JSON.stringify(d.value),actor]);
   await tx.query('INSERT INTO audit_log(id,actor_id,action,entity_id,detail) VALUES($1,$2,$3,$4,$5)',[randomUUID(),actor,'merchandising.saved',d.scope,JSON.stringify({revision:d.revision+1})]);
   return {ok:true};
  });
 }
 async prices(){return {items:(await this.db.pool.query(`SELECT p.id,p.sku,COALESCE(e.draft->>'name',p.name) AS name,e.revision,
  COALESCE(e.published,e.draft)->'content'->>'category' AS category,COALESCE(e.published,e.draft)->'content'->>'image' AS image,
  COALESCE(e.published,e.draft)->'content'->>'badge' AS badge,
  CASE WHEN p.active THEN 'published' WHEN p.ever_published THEN 'unpublished' ELSE 'draft' END AS lifecycle,
  CASE WHEN p.ever_published THEN pr.regular_minor ELSE (e.draft->>'regularMinor')::bigint END AS regular_minor,
  CASE WHEN p.ever_published THEN pr.final_minor ELSE (e.draft->>'finalMinor')::bigint END AS final_minor
  FROM products p JOIN product_editor e ON e.product_id=p.id LEFT JOIN product_prices pr ON pr.product_id=p.id WHERE p.archived_at IS NULL ORDER BY p.sku`)).rows.map(r=>({...r,regularMinor:r.regular_minor==null?null:money(r.regular_minor),finalMinor:r.final_minor==null?null:money(r.final_minor)}))};}
 async price(actor:string,id:string,raw:unknown){
  z.uuid().parse(id);const d=z.object({revision:z.number().int().positive(),regularMinor:z.number().int().min(0).max(1e12),finalMinor:z.number().int().min(0).max(1e12),badge:z.enum(['','Бестселлер','Новинка','Выбор ASAYA','Лимитированная серия'])}).strict().refine(v=>v.finalMinor<=v.regularMinor).parse(raw);
  return this.db.transaction(async tx=>{
   if(!(await tx.query("SELECT 1 FROM users WHERE id=$1 AND role='admin' AND NOT disabled",[actor])).rowCount)throw new DomainError('FORBIDDEN',403);
   await lock(tx,'catalog:admin');
   const p=(await tx.query('SELECT * FROM products WHERE id=$1 FOR UPDATE',[id])).rows[0],e=(await tx.query('SELECT * FROM product_editor WHERE product_id=$1 FOR UPDATE',[id])).rows[0];
   if(!p||!e)throw new DomainError('PRODUCT_NOT_FOUND',404);if(p.archived_at)throw new DomainError('PRODUCT_ARCHIVED');if(e.revision!==d.revision)throw new DomainError('EDIT_CONFLICT');
   const patch=(v:any)=>({...v,regularMinor:d.regularMinor,finalMinor:d.finalMinor,content:{...v.content,badge:d.badge}});
   if(p.ever_published)await tx.query('UPDATE product_prices SET regular_minor=$2,final_minor=$3 WHERE product_id=$1',[id,d.regularMinor,d.finalMinor]);
   await tx.query('UPDATE product_editor SET draft=$2,published=$3,revision=revision+1,updated_by=$4,updated_at=now() WHERE product_id=$1',[id,JSON.stringify(patch(e.draft)),e.published?JSON.stringify(patch(e.published)):null,actor]);
   await tx.query('INSERT INTO audit_log(id,actor_id,action,entity_id,detail) VALUES($1,$2,$3,$4,$5)',[randomUUID(),actor,'product.price_updated',id,JSON.stringify(d)]);return {ok:true};
  });
 }
}
