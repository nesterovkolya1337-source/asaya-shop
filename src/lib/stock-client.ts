import {AuthClientError,createStoreRequest} from './auth-client.ts';
export type StockItem={productId:string;sku:string;name:string;category:string|null;image:string|null;quantity:number|null;quantityState:'known'|'missing'|'not_synced'};
export type StockReport={configured:boolean;source:null|{externalWarehouseId:string;environment:'test'|'production';syncedAt:string|null;sourceUpdatedAt:string|null;expiresAt:string|null;nextAttemptAt:string|null;syncStatus:'fresh'|'stale'|'error'|'never_synced';lastError:string|null};items:StockItem[]};
const obj=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v))throw new AuthClientError('INVALID_RESPONSE');return v as Record<string,unknown>;};
const str=(v:unknown)=>{if(typeof v!=='string')throw new AuthClientError('INVALID_RESPONSE');return v;};
const nullable=(v:unknown)=>v===null?null:str(v);
const date=(v:unknown)=>{const s=nullable(v);if(s!==null&&!Number.isFinite(Date.parse(s)))throw new AuthClientError('INVALID_RESPONSE');return s;};
const choice=<T extends string>(v:unknown,values:readonly T[]):T=>{if(!values.includes(v as T))throw new AuthClientError('INVALID_RESPONSE');return v as T;};
export function parseStockReport(raw:unknown):StockReport{
 const r=obj(raw);if(typeof r.configured!=='boolean'||!Array.isArray(r.items))throw new AuthClientError('INVALID_RESPONSE');
 if(!r.configured){if(r.source!==null||r.items.length)throw new AuthClientError('INVALID_RESPONSE');return {configured:false,source:null,items:[]};}
 const s=obj(r.source),source={externalWarehouseId:str(s.externalWarehouseId),environment:choice(s.environment,['test','production'] as const),syncedAt:date(s.syncedAt),sourceUpdatedAt:date(s.sourceUpdatedAt),expiresAt:date(s.expiresAt),nextAttemptAt:date(s.nextAttemptAt),syncStatus:choice(s.syncStatus,['fresh','stale','error','never_synced'] as const),lastError:nullable(s.lastError)};
 const seen=new Set<string>();
 const items=r.items.map(raw=>{const i=obj(raw),quantityState=choice(i.quantityState,['known','missing','not_synced'] as const),sku=str(i.sku);
  if(quantityState==='known'&&(!Number.isSafeInteger(i.quantity)||Number(i.quantity)<0))throw new AuthClientError('INVALID_RESPONSE');
  if(seen.has(sku)||quantityState!=='known'&&i.quantity!==null)throw new AuthClientError('INVALID_RESPONSE');seen.add(sku);
  const image=nullable(i.image);if(image&&!/^\/(?!\/)[A-Za-z0-9_./-]+$/.test(image)&&!/^https:\/\//.test(image))throw new AuthClientError('INVALID_RESPONSE');
  return {productId:str(i.productId),sku,name:str(i.name),category:nullable(i.category),image,quantity:i.quantity as number|null,quantityState};
 });
 return {configured:true,source,items};
}
export function createStockClient(base:string,fetcher:typeof fetch=fetch){
 const request=createStoreRequest(base,fetcher);
 return {async get(){return parseStockReport(await request('analytics/stocks','GET'));},
  async refresh(csrf:string){const r=obj(await request('analytics/stocks/refresh','POST',{},csrf,undefined,20000));return choice(r.outcome,['updated','not_due','in_progress'] as const);}};
}
