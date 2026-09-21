import {z} from 'zod';
import {canonical,DomainError,hash} from './core.js';
import {CdekStockFeed,StockRateLimitError,type StockSettings,type StockSnapshot} from './cdek-stock-feed.js';

const base='https://cdek.orderadmin.ru/api/products/offer';
export const apiStockSettingsSchema=z.object({
 kind:z.literal('cdek_ff_api'),warehouseId:z.uuid(),accountId:z.string().min(1).max(100),
 externalWarehouseId:z.string().regex(/^\d+$/),shopId:z.number().int().positive(),environment:z.enum(['test','production']),
 login:z.string().min(1).max(254).refine(v=>!/[\r\n:]/.test(v)),password:z.string().min(1).max(1024),
 pollSeconds:z.number().int().min(30).max(86400).default(300),maxAgeSeconds:z.number().int().min(60).max(3600).default(900)
}).strict().refine(s=>s.environment!=='production'||s.externalWarehouseId!=='7460');
export type ApiStockSettings=Omit<z.infer<typeof apiStockSettingsSchema>,'login'|'password'>;
export type SourceSettings=StockSettings|ApiStockSettings;
export interface StockSource {readonly settings:SourceSettings;read():Promise<StockSnapshot>}
export const sourceKind=(s:SourceSettings)=>'kind' in s?s.kind:'cdek_ff_yml';
const count=z.number().int().min(0).max(1000000);
const offer=z.object({id:z.number().int().positive(),article:z.string().nullable(),
 items:z.array(z.object({count,state:z.enum(['new','normal','booked','shipped']),warehouse:z.number().int().positive()})).nullable(),
 inventoryUpdated:z.string().nullable(),_embedded:z.object({shop:z.object({id:z.number().int().positive()})})});
const pageSchema=z.object({page:z.number().int().positive(),page_count:z.number().int().min(0).max(100),
 page_size:z.number().int().positive(),total_items:z.number().int().min(0).max(10000),
 _embedded:z.object({product_offer:z.array(offer).max(100)})});

// Official FF Basic Auth. Credentials stay in a private field, never diagnostics/settings.
export class CdekStockApi implements StockSource {
 readonly settings:ApiStockSettings;
 #authorization:string;
 constructor(raw:unknown,private request:typeof fetch=fetch,private clock=()=>new Date()){
  let parsed:z.infer<typeof apiStockSettingsSchema>;
  try{parsed=apiStockSettingsSchema.parse(raw);}catch{throw new DomainError('STOCK_API_CONFIG_INVALID',503);}
  const {login,password,...settings}=parsed;this.settings=settings;
  this.#authorization='Basic '+Buffer.from(login+':'+password).toString('base64');
 }
 async read():Promise<StockSnapshot>{
  const started=this.clock(),signal=AbortSignal.timeout(30000),items:StockSnapshot['items']=[],ids=new Set<number>(),skus=new Set<string>();
  let pages=1,total:number|undefined,seen=0;
  try{
   for(let page=1;page<=pages;page++){
    const response=await this.request(base+'?page='+page+'&per_page=100',{method:'GET',redirect:'error',cache:'no-store',signal,
     headers:{authorization:this.#authorization,accept:'application/hal+json','cache-control':'no-cache'}});
    if(response.status===429){const value=response.headers.get('retry-after')??'';await response.body?.cancel();
     const seconds=/^\d+$/.test(value)?Number(value):Math.ceil((Date.parse(value)-+this.clock())/1000);
     throw new StockRateLimitError(Number.isFinite(seconds)?Math.max(0,Math.min(2592000,seconds)):0);}
    if(response.status===401||response.status===403){await response.body?.cancel();throw new DomainError('STOCK_SOURCE_UNAUTHORIZED',503);}
    const age=Number(response.headers.get('age')??0),date=Date.parse(response.headers.get('date')??'');
    if(!response.ok||!response.body){await response.body?.cancel();throw new Error('provider response');}
    if(!Number.isFinite(age)||age!==0||!Number.isFinite(date)||Math.abs(+this.clock()-date)>60000){await response.body.cancel();throw new DomainError('STOCK_SOURCE_STALE',503);}
    const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
    try{for(;;){const r=await reader.read();if(r.done)break;size+=r.value.byteLength;if(size>2*1024*1024)throw new Error('size');chunks.push(r.value);}}
    catch(e){await reader.cancel().catch(()=>{});throw e;}finally{reader.releaseLock();}
    const data=pageSchema.parse(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks))));
    if(data.page!==page||data.page_size!==100||(total!==undefined&&(total!==data.total_items||pages!==data.page_count)))throw new Error('pagination');
    pages=data.page_count;total=data.total_items;
    for(const row of data._embedded.product_offer){
     if(ids.has(row.id))throw new Error('duplicate offer');ids.add(row.id);seen++;
     if(row._embedded.shop.id!==this.settings.shopId)continue;
     // FF service records (printing, packing) have no article and no physical inventory.
     if(row.article===null){if(row.items?.some(i=>i.count>0))throw new Error('unmapped physical item');continue;}
     if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(row.article)||skus.has(row.article))throw new Error('article');skus.add(row.article);
     const quantity=count.parse((row.items??[]).filter(i=>String(i.warehouse)===this.settings.externalWarehouseId&&i.state==='normal').reduce((n,i)=>n+i.count,0));
     const changedAt=row.inventoryUpdated===null?undefined:new Date(row.inventoryUpdated);
     if(changedAt&&(!Number.isFinite(+changedAt)||+changedAt>+started+60000))throw new Error('inventory date');
     if(quantity>0&&!changedAt)throw new Error('inventory date missing');
     items.push({sku:row.article,quantity,...(changedAt?{changedAt}: {})});
    }
   }
   if(seen!==total||!items.length||+this.clock()-+started>30000)throw new Error('incomplete snapshot');
   items.sort((a,b)=>a.sku.localeCompare(b.sku,'en'));
   // Request start is conservative for local shipments concurrent with paginated reads.
   // inventoryUpdated is last mutation, NOT a TTL timestamp for the live observation.
   return {generatedAt:started,items,digest:hash(canonical(items.map(i=>({...i,changedAt:i.changedAt?.toISOString()??null}))))};
  }catch(e){if(e instanceof StockRateLimitError||e instanceof DomainError&&['STOCK_SOURCE_UNAUTHORIZED','STOCK_SOURCE_STALE'].includes(e.code))throw e;
   throw new DomainError('STOCK_SOURCE_UNAVAILABLE',503);}
 }
}
export function createStockSource(raw:unknown,request:typeof fetch=fetch):StockSource{
 return raw&&typeof raw==='object'&&'kind' in raw&&raw.kind==='cdek_ff_api'?new CdekStockApi(raw,request):new CdekStockFeed(raw,request);
}
