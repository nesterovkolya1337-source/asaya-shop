import {createHash,randomUUID} from 'node:crypto';
import {Database,lock} from './db.js';
import {sitePageDefaults} from './site-content-defaults.js';
import {parseSitePage,sitePublicationIssues,type SitePage,type SitePageId} from './site-content-format.js';

// Explicit release operation, never run at startup or during a migration.
export const legalPublicationIds=['offer','privacy','personal-data','delivery','returns','support','requisites','header','footer'] as const;
type Id=typeof legalPublicationIds[number];
type Snapshot={id:Id;revision:number;draft:SitePage;published:SitePage|null;published_at:unknown;updated_by:string;updated_at:unknown};
export type LegalPublicationPlan={version:'v10.1';pages:Array<{id:Id;before:Snapshot|null;after:SitePage}>};
const hash=(value:unknown):string=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function legalReleasePage(id:Id,current?:SitePage|null):SitePage {
 if(id!=='header'&&id!=='footer')return parseSitePage(structuredClone(sitePageDefaults[id]));
 const page=parseSitePage(structuredClone(current??sitePageDefaults[id]));
 // Preserve the merchant's layout, images, promotion and unrelated menu items.
 for(const block of page.blocks){
  block.items=block.items.filter(item=>!item.href?.startsWith('tel:'));
  for(const value of [block.values,...block.items]){
   if(/^\/legal\/cookies\/?(?:[?#].*)?$/.test(value.href??'')){
    value.href='/legal/privacy/';
    if(value.title)value.title='Политика конфиденциальности';
    if(value.buttonText)value.buttonText='Политика конфиденциальности';
   }
  }
  if(block.type==='siteHelp'){
   const approved=sitePageDefaults.footer.blocks.find(b=>b.type==='siteHelp')!;
   block.values=structuredClone(approved.values);block.items=structuredClone(approved.items);
  }
 }
 return page;
}

export async function planLegalPublication(db:Database):Promise<LegalPublicationPlan>{
 const rows=(await db.pool.query('SELECT * FROM site_pages WHERE id=ANY($1::text[])',[legalPublicationIds])).rows as Snapshot[];
 return {version:'v10.1',pages:legalPublicationIds.map(id=>{
  const before=rows.find(row=>row.id===id)??null;
  return {id,before,after:legalReleasePage(id,before?.published)};
 })};
}

export async function applyLegalPublication(db:Database,actor:string,plan:LegalPublicationPlan){
 if(plan.version!=='v10.1'||!Array.isArray(plan.pages)||plan.pages.length!==legalPublicationIds.length||
  plan.pages.some((p,i)=>p.id!==legalPublicationIds[i]||hash(p.after)!==hash(legalReleasePage(p.id,p.before?.published))))throw Error('INVALID_LEGAL_PLAN');
 for(const p of plan.pages)if(sitePublicationIssues(parseSitePage(p.after)).length)throw Error('INCOMPLETE_LEGAL_PAGE');
 return db.transaction(async tx=>{
  if(!(await tx.query("SELECT 1 FROM users WHERE id=$1 AND role='admin' AND NOT disabled FOR SHARE",[actor])).rowCount)throw Error('FORBIDDEN');
  // Lock and check EVERY revision before writing the first page.
  for(const p of plan.pages){
   await lock(tx,'site:'+p.id);
   const current=(await tx.query('SELECT revision FROM site_pages WHERE id=$1 FOR UPDATE',[p.id])).rows[0];
   if((current?.revision??0)!==(p.before?.revision??0))throw Error('LEGAL_PLAN_STALE');
  }
  for(const p of plan.pages){
   const revision=(p.before?.revision??0)+1;
   // Leave existing private drafts intact, so publication never loses editor work.
   const draft=p.before?.draft??p.after;
   await tx.query(`INSERT INTO site_pages(id,revision,draft,published,published_at,updated_by)
    VALUES($1,$2,$3,$4,now(),$5) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,
    published=excluded.published,published_at=now(),updated_by=excluded.updated_by,updated_at=now()`,
    [p.id,revision,JSON.stringify(draft),JSON.stringify(p.after),actor]);
   await tx.query('INSERT INTO audit_log(id,actor_id,action,entity_id,detail) VALUES($1,$2,$3,$4,$5)',
    [randomUUID(),actor,'site.legal_v10_1_published','site:'+p.id,JSON.stringify({revision,contentHash:hash(p.after)})]);
  }
  return {published:plan.pages.length};
 });
}
