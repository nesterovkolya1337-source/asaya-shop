import {createHash,randomUUID} from 'node:crypto';
import {z} from 'zod';
import {Database} from './db.js';

const rowSchema=z.object({sku:z.string().min(1),rating:z.number().int().min(1).max(5),body:z.string(),author:z.string(),date:z.iso.datetime({offset:true})}).strict();
// Input is a lossless extraction of the feedbacks worksheet, not browser-submitted reviews.
// Identical rows within an export remain separate reviews; occurrence is stable on re-import.
export async function importWildberries(db:Database,rows:unknown[]){
 const stats={read:rows.length,imported:0,missingSku:0,duplicateSkipped:0,invalid:0};
 return db.transaction(async tx=>{
  const products=(await tx.query('SELECT id,sku FROM products')).rows;
  const bySku=new Map<string,string>();
  for(const p of products){const key=p.sku.toLowerCase();if(bySku.has(key))throw new Error('AMBIGUOUS_CANONICAL_SKU');bySku.set(key,p.id);}
  const occurrences=new Map<string,number>();
  for(const raw of rows){
   const parsed=rowSchema.safeParse(raw);if(!parsed.success){stats.invalid++;continue;}
   const r=parsed.data,sku=r.sku.toLowerCase();
   const hash=createHash('sha256').update(JSON.stringify([sku,r.rating,r.body,r.author,r.date])).digest('hex');
   const occurrence=(occurrences.get(hash)??0)+1;occurrences.set(hash,occurrence);
   const product=bySku.get(sku);if(!product){stats.missingSku++;continue;}
   const inserted=await tx.query(`INSERT INTO product_reviews(id,product_id,source,external_key,rating,body,author_display_name,review_date,status)
    VALUES($1,$2,'wildberries',$3,$4,$5,$6,$7,'published') ON CONFLICT DO NOTHING RETURNING id`,
    [randomUUID(),product,hash+':'+occurrence,r.rating,r.body,r.author,r.date]);
   if(inserted.rowCount)stats.imported++;else stats.duplicateSkipped++;
  }
  return stats;
 });
}
