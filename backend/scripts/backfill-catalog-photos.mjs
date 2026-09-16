// Fill empty image fields of confirmed, unpublished cards; preserve concurrent edits.
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const {Database}=await import(pathToFileURL(resolve('dist/src/db.js')).href);
const {AdminCatalog}=await import(pathToFileURL(resolve('dist/src/admin-catalog.js')).href);
const [manifest,email,flag]=process.argv.slice(2);
if(!manifest||!email||flag&&flag!=='--apply')throw Error('Usage: backfill-catalog-photos.mjs manifest.json actor-email [--apply]');
const photos=JSON.parse(await readFile(manifest,'utf8'));
if(!Array.isArray(photos)||new Set(photos.map(p=>p.slug)).size!==photos.length)throw Error('Invalid manifest');
for(const p of photos){
 if(!/^[a-z0-9-]+$/.test(p.slug)||!Array.isArray(p.gallery)||p.gallery.length>12)throw Error('Invalid photo entry');
 for(const url of [p.image,...p.gallery])if(typeof url!=='string'||!/^\/images\/[A-Za-z0-9_./-]+$/.test(url)||url.includes('..'))throw Error('Invalid image path');
}
const db=new Database(process.env.DATABASE_URL);
try{
 const actor=(await db.pool.query("SELECT c.user_id FROM staff_credentials c JOIN users u ON u.id=c.user_id WHERE c.email=$1 AND u.role='admin' AND NOT u.disabled",[email.toLowerCase()])).rows[0]?.user_id;
 if(!actor)throw Error('Administrator not found');
 const catalog=new AdminCatalog(db),result=[];
 for(const photo of photos){
  const mapping=(await db.pool.query('SELECT product_id FROM storefront_mappings WHERE slug=$1 AND approved',[photo.slug])).rows[0];
  if(!mapping?.product_id){result.push({slug:photo.slug,status:'unconfirmed'});continue;}
  const card=await catalog.detail(mapping.product_id);
  if(card.active||card.draft.content.image||card.draft.content.gallery.length){result.push({slug:photo.slug,status:'preserved'});continue;}
  const draft={...card.draft,content:{...card.draft.content,image:photo.image,gallery:photo.gallery}};
  if(flag==='--apply'){
   try{await catalog.save(actor,card.id,{...draft,revision:card.revision});}
   catch(e){if(e.code==='EDIT_CONFLICT'){result.push({slug:photo.slug,status:'concurrent_edit_skipped'});continue;}throw e;}
  }
  result.push({slug:photo.slug,status:flag==='--apply'?'saved':'ready',images:1+photo.gallery.length});
 }
 console.log(JSON.stringify(result));
}finally{await db.close();}
