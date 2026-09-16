import {createHash,randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {z} from 'zod';
import {Database,lock} from './db.js';
import {DomainError} from './core.js';
export const MAX_IMAGE_BYTES=6*1024*1024;
export const MAX_IMAGE_PIXELS=25_000_000;
const digest=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
function rasterHeader(b:Buffer){
 return b.length>=12&&(
  b[0]===0xff&&b[1]===0xd8&&b[2]===0xff||
  b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||
  b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP');
}
export async function prepareImage(input:Buffer){
 if(!input.length||input.length>MAX_IMAGE_BYTES)throw new DomainError('IMAGE_TOO_LARGE',413);
 if(!rasterHeader(input))throw new DomainError('UNSUPPORTED_IMAGE',400);
 try{
  const processor=sharp(input,{failOn:'warning',limitInputPixels:MAX_IMAGE_PIXELS,animated:false});
  const metadata=await processor.metadata();
  if(!['jpeg','png','webp'].includes(metadata.format)||!metadata.width||!metadata.height||(metadata.pages??1)>1)throw new Error('unsupported');
  // Re-encode pixels, strip original metadata, preserve transparency and orient from EXIF.
  const {data,info}=await processor.rotate().resize({width:2048,height:2048,fit:'inside',withoutEnlargement:true})
   .webp({quality:88,effort:4}).timeout({seconds:5}).toBuffer({resolveWithObject:true});
  if(data.length>MAX_IMAGE_BYTES)throw new Error('output too large');
  return {content:data,width:info.width,height:info.height,contentHash:digest(data)};
 }catch{throw new DomainError('INVALID_IMAGE',400);}
}
export class MediaService{
 private processing=0;
 constructor(private db:Database){}
 private result(row:{id:string;width:number;height:number;bytes:number}){return {id:row.id,url:'/api/store/v1/media/'+row.id,width:row.width,height:row.height,bytes:row.bytes,mime:'image/webp' as const};}
 async upload(actor:string,raw:unknown){
  const {id,data}=z.object({id:z.uuid(),data:z.string().min(4).max(MAX_IMAGE_BYTES/3*4+4)}).strict().parse(raw);
  if(data.length%4!==0||!/^[A-Za-z0-9+/]+={0,2}$/.test(data))throw new DomainError('INVALID_IMAGE',400);
  const bytes=Buffer.from(data,'base64');
  if(bytes.length>MAX_IMAGE_BYTES)throw new DomainError('IMAGE_TOO_LARGE',413);
  if(bytes.toString('base64')!==data)throw new DomainError('INVALID_IMAGE',400);
  const sourceHash=digest(bytes);
  const existing=await this.db.pool.query('SELECT id,uploader_id,source_hash,width,height,octet_length(content) AS bytes FROM product_media WHERE id=$1',[id]);
  if(existing.rows[0]){
   const prior=existing.rows[0];if(prior.uploader_id!==actor||prior.source_hash!==sourceHash)throw new DomainError('MEDIA_CONFLICT',409);
   return this.result(prior);
  }
  if(this.processing>=2)throw new DomainError('MEDIA_BUSY',429);
  this.processing++;
  let image:Awaited<ReturnType<typeof prepareImage>>;
  try{image=await prepareImage(bytes);}finally{this.processing--;}
  return this.db.transaction(async tx=>{
   if(!(await tx.query("SELECT 1 FROM users WHERE id=$1 AND role='admin' AND NOT disabled FOR SHARE",[actor])).rowCount)throw new DomainError('FORBIDDEN',403);
   await lock(tx,'media:'+id);
   const prior=(await tx.query('SELECT id,uploader_id,source_hash,width,height,octet_length(content) AS bytes FROM product_media WHERE id=$1',[id])).rows[0];
   if(prior){
    if(prior.uploader_id!==actor||prior.source_hash!==sourceHash)throw new DomainError('MEDIA_CONFLICT',409);
    return this.result(prior);
   }
   await tx.query('INSERT INTO product_media(id,uploader_id,source_hash,content_hash,content,width,height) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,actor,sourceHash,image.contentHash,image.content,image.width,image.height]);
   await tx.query("INSERT INTO audit_log(id,actor_id,action,entity_id,detail) VALUES($1,$2,'media.uploaded',$3,$4)",[randomUUID(),actor,id,JSON.stringify({width:image.width,height:image.height,bytes:image.content.length})]);
   return this.result({id,width:image.width,height:image.height,bytes:image.content.length});
  });
 }
 async get(id:string){
  z.uuid().parse(id);
  const row=(await this.db.pool.query('SELECT content,content_hash FROM product_media WHERE id=$1',[id])).rows[0];
  if(!row)throw new DomainError('MEDIA_NOT_FOUND',404);
  return {content:row.content as Buffer,contentHash:row.content_hash as string};
 }
}

