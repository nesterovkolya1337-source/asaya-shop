import {SaxesParser} from 'saxes';
import {z} from 'zod';
import {DomainError,hash,canonical} from './core.js';

export const stockSettingsSchema=z.object({
 warehouseId:z.uuid(),accountId:z.string().min(1).max(100),externalWarehouseId:z.string().regex(/^\d+$/),
 environment:z.enum(['test','production']),
 feedUrl:z.url().refine(v=>{const u=new URL(v);return u.origin==='https://static.integrations.ffcdek.ru'&&!u.username&&!u.password&&!u.search&&!u.hash&&/^\/export_products\/yml\/[a-f0-9]{32}\.xml$/.test(u.pathname);}),
 // FF documents a 30-minute export cadence. Poll every 5 minutes, allow 40 minutes
 // of provider age (generation + polling/grace), independently of fetch freshness.
 pollSeconds:z.number().int().min(30).max(86400).default(300),
 maxAgeSeconds:z.number().int().min(60).max(172800).default(2400)
}).strict().refine(s=>s.environment!=='production'||s.externalWarehouseId!=='7460',{message:'Test warehouse cannot supply production stock'});
export type StockSettings=z.infer<typeof stockSettingsSchema>;
export type StockSnapshot={generatedAt:Date;items:Array<{sku:string;quantity:number}>;digest:string};
export class StockRateLimitError extends DomainError {
 constructor(readonly retryAfterSeconds:number){super('STOCK_SOURCE_RATE_LIMITED',503);}
}
const invalid=()=>new DomainError('STOCK_FEED_INVALID',503);

// Strict XML, no DTD/entities, no prices/names imported. Observed FF contract:
// yml_catalog@date, offer@id == param[code=article], integer count.
export function parseStockFeed(xml:string):StockSnapshot {
 try{
  if(Buffer.byteLength(xml)>2*1024*1024)throw invalid();
  const parser=new SaxesParser(),stack:string[]=[],seen=new Set<string>();
  const items:StockSnapshot['items']=[];let generated='',shops=0,offers=0;
  let item:{id:string;article?:string;count?:string}|undefined,field='',value='';
  parser.on('doctype',()=>{throw invalid();});
  parser.on('opentag',tag=>{
   stack.push(tag.name);const path=stack.join('/');if(stack.length>8)throw invalid();
   if(stack.length===1){if(tag.name!=='yml_catalog')throw invalid();generated=String(tag.attributes.date??'');}
   if(path==='yml_catalog/shop'&&++shops!==1)throw invalid();
   if(path==='yml_catalog/shop/offers'&&++offers!==1)throw invalid();
   if(tag.name==='offer'){
    if(path!=='yml_catalog/shop/offers/offer'||item||items.length>=10000)throw invalid();
    item={id:String(tag.attributes.id??'')};
   }else if(item&&stack.length===5){
    field=tag.name==='count'?'count':tag.name==='param'&&tag.attributes.code==='article'?'article':'';value='';
    if(field&&item[field as 'count'|'article']!==undefined)throw invalid();
   }else if(item&&stack.length>5&&field)throw invalid();
  });
  const append=(text:string)=>{if(field){value+=text;if(value.length>200)throw invalid();}};
  parser.on('text',append);parser.on('cdata',append);
  parser.on('closetag',tag=>{
   if(item&&stack.length===5&&field){item[field as 'count'|'article']=value.trim();field='';}
   if(tag.name==='offer'){
    if(!item||!item.article||item.article!==item.id||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(item.article)||seen.has(item.article)||! /^(0|[1-9]\d{0,6})$/.test(item.count??''))throw invalid();
    const quantity=Number(item.count);if(quantity>1000000)throw invalid();
    seen.add(item.article);items.push({sku:item.article,quantity});item=undefined;
   }
   stack.pop();
  });
  parser.write(xml).close();
  if(shops!==1||offers!==1||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})$/.test(generated))throw invalid();
  const generatedAt=new Date(generated);if(!Number.isFinite(+generatedAt)||!z.iso.date().safeParse(generated.slice(0,10)).success)throw invalid();
  items.sort((a,b)=>a.sku.localeCompare(b.sku,'en'));
  return {generatedAt,items,digest:hash(canonical(items))};
 }catch{throw invalid();}
}

export class CdekStockFeed {
 readonly settings:StockSettings;
 constructor(settings:unknown,private request:typeof fetch=fetch){this.settings=stockSettingsSchema.parse(settings);}
 async read():Promise<StockSnapshot>{
  try{
   const response=await this.request(this.settings.feedUrl,{method:'GET',redirect:'error',signal:AbortSignal.timeout(10000),headers:{accept:'application/xml,text/xml'}});
   if(response.status===429){
    const value=response.headers.get('retry-after')??'';
    const seconds=/^\d+$/.test(value)?Number(value):Math.ceil((Date.parse(value)-Date.now())/1000);
    await response.body?.cancel();
    throw new StockRateLimitError(Number.isFinite(seconds)?Math.max(0,Math.min(2592000,seconds)):0);
   }
   if(!response.ok||!response.body){await response.body?.cancel();throw invalid();}
   const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
   try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2*1024*1024)throw invalid();chunks.push(value);}}
   catch{await reader.cancel().catch(()=>{});throw invalid();}finally{reader.releaseLock();}
   return parseStockFeed(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
  }catch(error){if(error instanceof StockRateLimitError)throw error;throw new DomainError('STOCK_SOURCE_UNAVAILABLE',503);}
 }
}
