import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {Database,lock} from './db.js';
import {DomainError} from './core.js';
import {StockRateLimitError,type StockSnapshot} from './cdek-stock-feed.js';
import {sourceKind,type StockSource} from './cdek-stock-source.js';
import {safeStockError,stockSourceHash} from './stock-state.js';
import {checkPublishedStockCoverage,StockMappingError} from './stock-coverage.js';

export class StockSync {
 constructor(private db:Database,readonly source:StockSource,private clock=()=>new Date()){}
 async refresh(){
  const s=this.source.settings,client=await this.db.pool.connect(),key='stock-refresh:'+s.warehouseId;
  let acquired=false,destroy=false;
  try{
   acquired=(await client.query('SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS acquired',[key])).rows[0].acquired;
   if(!acquired)return {skipped:true,reason:'in_progress'} as const;
   const binding=(await client.query(`SELECT 1 FROM warehouse_external_ids x JOIN warehouses w ON w.id=x.warehouse_id
    WHERE w.id=$1 AND w.active AND x.provider='cdek_ff' AND x.account_id=$2 AND x.external_id=$3`,[s.warehouseId,s.accountId,s.externalWarehouseId])).rowCount;
   if(!binding)throw new DomainError('STOCK_WAREHOUSE_SCOPE_MISMATCH');
   const prior=(await client.query('SELECT source_hash,next_attempt_at,consecutive_failures FROM stock_sources WHERE warehouse_id=$1',[s.warehouseId])).rows[0];
   if(prior&&prior.source_hash!==stockSourceHash(s))throw new DomainError('STOCK_SOURCE_CHANGE_REQUIRES_REVIEW');
   if(prior?.next_attempt_at&&new Date(prior.next_attempt_at)>this.clock())return {skipped:true,reason:'not_due'} as const;
   try{return await this.apply(await this.source.read());}
   catch(error){
    const at=this.clock(),failures=Math.min((prior?.consecutive_failures??0)+1,1000000);
    const seconds=Math.max(s.pollSeconds,Math.min(3600,s.pollSeconds*2**Math.min(failures-1,10)),error instanceof StockRateLimitError?error.retryAfterSeconds:0);
    const safe=safeStockError(error instanceof DomainError?error.code:null);
    await this.db.transaction(async tx=>{
     await lock(tx,'stock-source:'+s.warehouseId);
     // Only diagnostics change. Last successful generation, quantities and reserves survive.
     await tx.query(`INSERT INTO stock_sources(warehouse_id,source_hash,environment,healthy,last_error,last_attempt_at,next_attempt_at,consecutive_failures,source_kind)
      VALUES($1,$2,$3,false,$4,$5,$6,$7,$8) ON CONFLICT(warehouse_id) DO UPDATE SET healthy=false,last_error=excluded.last_error,
      last_attempt_at=excluded.last_attempt_at,next_attempt_at=excluded.next_attempt_at,consecutive_failures=excluded.consecutive_failures
      WHERE stock_sources.source_hash=excluded.source_hash`,[s.warehouseId,stockSourceHash(s),s.environment,safe,at,new Date(+at+seconds*1000),failures,sourceKind(s)]);
     if(error instanceof StockMappingError)await tx.query('UPDATE stock_sources SET unknown_skus=$2 WHERE warehouse_id=$1 AND source_hash=$3',[s.warehouseId,error.articles,stockSourceHash(s)]);
     await tx.query("UPDATE warehouse_external_ids SET sync_status='error' WHERE provider='cdek_ff' AND warehouse_id=$1 AND account_id=$2 AND external_id=$3",[s.warehouseId,s.accountId,s.externalWarehouseId]);
    });
    if(error instanceof StockMappingError)throw error;
    throw new DomainError('STOCK_REFRESH_FAILED',503);
   }
  }finally{
   if(acquired){try{await client.query('SELECT pg_advisory_unlock(hashtextextended($1,0))',[key]);}catch{destroy=true;}}
   // A failed unlock destroys the connection instead of returning a held session lock.
   client.release(destroy);
  }
 }
 async apply(snapshot:StockSnapshot){
  const s=this.source.settings,now=this.clock();
  const sourceHash=stockSourceHash(s);
  if(+snapshot.generatedAt>+now+60000||+snapshot.generatedAt+s.maxAgeSeconds*1000<=+now)throw new DomainError('STOCK_SOURCE_STALE',503);
  return this.db.transaction(async tx=>{
   await lock(tx,'stock-source:'+s.warehouseId);
   if(!(await tx.query(`SELECT 1 FROM warehouse_external_ids x JOIN warehouses w ON w.id=x.warehouse_id
    WHERE w.id=$1 AND w.active AND x.provider='cdek_ff' AND x.account_id=$2 AND x.external_id=$3 FOR SHARE OF w,x`,[s.warehouseId,s.accountId,s.externalWarehouseId])).rowCount)throw new DomainError('STOCK_WAREHOUSE_SCOPE_MISMATCH');
   const previous=(await tx.query('SELECT * FROM stock_sources WHERE warehouse_id=$1 FOR UPDATE',[s.warehouseId])).rows[0];
   if(previous&&previous.source_hash!==sourceHash)throw new DomainError('STOCK_SOURCE_CHANGE_REQUIRES_REVIEW');
   if(previous?.generated_at&&+previous.generated_at>+snapshot.generatedAt)throw new DomainError('STOCK_SOURCE_REGRESSED');
   if(previous?.generated_at&&+previous.generated_at===+snapshot.generatedAt&&previous.payload_hash!==snapshot.digest)throw new DomainError('STOCK_SOURCE_VERSION_CONFLICT');
   const products=(await tx.query('SELECT id,sku FROM products ORDER BY sku FOR UPDATE')).rows;
   if(sourceKind(s)==='cdek_ff_api')await checkPublishedStockCoverage(tx,snapshot.items.map(i=>i.sku));
   const known=new Set(products.map(p=>p.sku)),unknown=snapshot.items.filter(i=>!known.has(i.sku)).map(i=>i.sku);
   const expires=new Date(Math.min(+snapshot.generatedAt+s.maxAgeSeconds*1000,+now+s.pollSeconds*3*1000));
   const changed=!previous?.generated_at||+previous.generated_at<+snapshot.generatedAt;
   await tx.query(`INSERT INTO stock_sources(warehouse_id,source_hash,environment,generated_at,fetched_at,expires_at,payload_hash,unknown_skus,source_kind)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(warehouse_id) DO UPDATE SET
    generated_at=excluded.generated_at,fetched_at=excluded.fetched_at,expires_at=excluded.expires_at,payload_hash=excluded.payload_hash,
    healthy=true,last_error=NULL,unknown_skus=excluded.unknown_skus`,[s.warehouseId,sourceHash,s.environment,snapshot.generatedAt,now,expires,snapshot.digest,unknown,sourceKind(s)]);
   await tx.query('UPDATE stock_sources SET last_attempt_at=$2,next_attempt_at=$3,consecutive_failures=0 WHERE warehouse_id=$1',
    [s.warehouseId,now,new Date(+now+s.pollSeconds*1000)]);
   for(const p of products){
    const item=snapshot.items.find(i=>i.sku===p.sku),quantity=item?.quantity??0;
    const already=(await tx.query('SELECT 1 FROM stock_source_items WHERE warehouse_id=$1 AND product_id=$2',[s.warehouseId,p.id])).rowCount;
    if(!changed&&already)continue; // A repeated feed must never replenish a consumed balance.
    await tx.query(`INSERT INTO inventory_balances(product_id,warehouse_id,on_hand) VALUES($1,$2,0) ON CONFLICT DO NOTHING`,[p.id,s.warehouseId]);
    const balance=(await tx.query('SELECT reserved FROM inventory_balances WHERE product_id=$1 AND warehouse_id=$2 FOR UPDATE',[p.id,s.warehouseId])).rows[0];
    // A cached snapshot can predate a confirmed dispatch. Keep its local debit until
    // a provider generation after that dispatch; never infer a return from a cancellation.
    const consumed=(await tx.query("SELECT COALESCE(sum(quantity),0)::integer n FROM inventory_movements WHERE product_id=$1 AND warehouse_id=$2 AND kind='ship' AND created_at>=$3",[p.id,s.warehouseId,item?.changedAt??snapshot.generatedAt])).rows[0].n;
    const sellable=Math.max(0,quantity-consumed);
    await tx.query('UPDATE inventory_balances SET on_hand=$3 WHERE product_id=$1 AND warehouse_id=$2',[p.id,s.warehouseId,Math.max(balance.reserved,sellable)]);
    await tx.query(`INSERT INTO stock_source_items(warehouse_id,product_id,quantity,provider_quantity,listed) VALUES($1,$2,$3,$4,$5)
     ON CONFLICT(warehouse_id,product_id) DO UPDATE SET quantity=excluded.quantity,provider_quantity=excluded.provider_quantity,listed=excluded.listed`,[s.warehouseId,p.id,sellable,quantity,Boolean(item)]);
   }
   await tx.query("UPDATE warehouse_external_ids SET sync_status='active',last_stock_sync_at=$4 WHERE warehouse_id=$1 AND account_id=$2 AND external_id=$3",[s.warehouseId,s.accountId,s.externalWarehouseId,now]);
   if(changed)await tx.query("INSERT INTO audit_log(id,action,entity_id,detail) VALUES($1,'stock.source_synced',$2,$3)",[randomUUID(),s.warehouseId,JSON.stringify({generatedAt:snapshot.generatedAt,offers:snapshot.items.length,unknownSkus:unknown})]);
   return {changed,offers:snapshot.items.length,matched:snapshot.items.length-unknown.length,unknownSkus:unknown,generatedAt:snapshot.generatedAt,expiresAt:expires};
  });
 }
}
export async function runStockWorker(service:Pick<StockSync,'refresh'|'source'>,signal:AbortSignal,report:(event:{event:string;code?:string})=>void,
 wait:(ms:number,signal:AbortSignal)=>Promise<void>=(ms,signal)=>delay(ms,undefined,{signal})){
 while(!signal.aborted){
  try{await service.refresh();}catch(error){report({event:'stock.refresh_failed',code:safeStockError(error instanceof DomainError?error.code:null)});}
  if(signal.aborted)break;
  try{await wait(service.source.settings.pollSeconds*1000,signal);}catch{if(!signal.aborted)throw new Error('Stock worker interrupted');}
 }
}
