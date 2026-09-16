import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {Database,lock,type Tx} from './db.js';
import {DomainError} from './core.js';
import {parseSitePage,sitePages,blockTemplates,sitePublicationIssues,type SitePage,type SitePageId} from './site-content-format.js';
import {sitePageDefaults} from './site-content-defaults.js';
function pageId(raw:string):SitePageId {if(!sitePages.some(p=>p.id===raw))throw new DomainError('PAGE_NOT_FOUND',404);return raw as SitePageId;}
function document(raw:unknown){try{return parseSitePage(raw);}catch{throw new DomainError('INVALID_SITE_CONTENT',400);}}
async function admin(tx:Tx,actor:string){if(!(await tx.query("SELECT 1 FROM users WHERE id=$1 AND role='admin' AND NOT disabled FOR SHARE",[actor])).rowCount)throw new DomainError('FORBIDDEN',403);}
async function checkMedia(tx:Tx,page:SitePage){
 const ids=new Set<string>();
 for(const b of page.blocks){const t=blockTemplates[b.type];for(const [v,fields] of [[b.values,t.fields],...b.items.map(v=>[v,t.items])] as Array<[Record<string,string>,typeof t.fields]>){for(const f of fields)if(f.kind==='image'){const match=v[f.key]?.match(/^\/api\/store\/v1\/media\/([a-f0-9-]+)$/);if(match)ids.add(match[1]!);}}}
 if(ids.size&&(await tx.query('SELECT id FROM product_media WHERE id=ANY($1::uuid[])',[[...ids]])).rowCount!==ids.size)throw new DomainError('MEDIA_REFERENCE_MISSING',400);
}
async function audit(tx:Tx,actor:string,id:string,action:string,revision:number){
 await tx.query('INSERT INTO audit_log(id,actor_id,action,entity_id,detail) VALUES($1,$2,$3,$4,$5)',[randomUUID(),actor,action,'site:'+id,JSON.stringify({pageId:id,revision})]);
}
export class SiteContent {
 constructor(private db:Database){}
 async get(rawId:string){
  const id=pageId(rawId),r=(await this.db.pool.query('SELECT revision,draft,published_at FROM site_pages WHERE id=$1',[id])).rows[0];
  return {id,revision:r?.revision??0,draft:r?document(r.draft):parseSitePage(sitePageDefaults[id]),publishedAt:r?.published_at??null};
 }
 async publicPage(rawId:string){
  const id=pageId(rawId),r=(await this.db.pool.query('SELECT published FROM site_pages WHERE id=$1',[id])).rows[0];
  if(!r?.published)return {page:null};
  const page=document(r.published);return {page:{...page,blocks:page.blocks.filter(b=>b.visible)}};
 }
 async save(actor:string,rawId:string,raw:unknown){
  const id=pageId(rawId),input=z.object({revision:z.number().int().nonnegative(),page:z.unknown()}).strict().parse(raw),page=document(input.page);
  if(page.id!==id)throw new DomainError('INVALID_SITE_CONTENT',400);
  return this.db.transaction(async tx=>{
   await admin(tx,actor);await lock(tx,'site:'+id);await checkMedia(tx,page);
   const prior=(await tx.query('SELECT revision FROM site_pages WHERE id=$1 FOR UPDATE',[id])).rows[0];
   if((prior?.revision??0)!==input.revision)throw new DomainError('EDIT_CONFLICT');
   const revision=input.revision+1;
   await tx.query(`INSERT INTO site_pages(id,revision,draft,updated_by) VALUES($1,$2,$3,$4)
    ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,draft=excluded.draft,updated_by=excluded.updated_by,updated_at=now()`,[id,revision,JSON.stringify(page),actor]);
   await audit(tx,actor,id,'site.draft_saved',revision);return {id,revision};
  });
 }
 async publish(actor:string,rawId:string,raw:unknown){
  const id=pageId(rawId),input=z.object({revision:z.number().int().positive()}).strict().parse(raw);
  return this.db.transaction(async tx=>{
   await admin(tx,actor);await lock(tx,'site:'+id);
   const r=(await tx.query('SELECT revision,draft FROM site_pages WHERE id=$1 FOR UPDATE',[id])).rows[0];
   if(!r)throw new DomainError('PAGE_NOT_FOUND',404);
   if(r.revision!==input.revision)throw new DomainError('EDIT_CONFLICT');
   const page=document(r.draft);if(sitePublicationIssues(page).length)throw new DomainError('PAGE_INCOMPLETE',400);await checkMedia(tx,page);
   const revision=r.revision+1;
   await tx.query('UPDATE site_pages SET published=draft,published_at=now(),revision=$2,updated_by=$3,updated_at=now() WHERE id=$1',[id,revision,actor]);
   await audit(tx,actor,id,'site.published',revision);return {id,revision};
  });
 }
 async restore(actor:string,rawId:string,raw:unknown){
  const id=pageId(rawId),input=z.object({revision:z.number().int().positive()}).strict().parse(raw);
  return this.db.transaction(async tx=>{
   await admin(tx,actor);await lock(tx,'site:'+id);
   const r=(await tx.query('SELECT revision,published FROM site_pages WHERE id=$1 FOR UPDATE',[id])).rows[0];
   if(!r)throw new DomainError('PAGE_NOT_FOUND',404);if(r.revision!==input.revision)throw new DomainError('EDIT_CONFLICT');
   const revision=r.revision+1,draft=r.published??parseSitePage(sitePageDefaults[id]);
   await tx.query('UPDATE site_pages SET draft=$2,revision=$3,updated_by=$4,updated_at=now() WHERE id=$1',[id,JSON.stringify(draft),revision,actor]);
   await audit(tx,actor,id,'site.draft_restored',revision);return {id,revision};
  });
 }
}
