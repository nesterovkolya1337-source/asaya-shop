import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {Database,lock} from './db.js';
import {DomainError,hash,canonical} from './core.js';
import {CdekStockFeed,type StockSnapshot} from './cdek-stock-feed.js';

export class StockSync {
 constructor(private db:Database,readonly source:CdekStockFeed,private clock=()=>new Date()){}
 async refresh(){
  try{return await this.apply(await this.source.read());}
  catch{
   // Failed refresh fails closed; no zeroing of physical/reserved ledger rows.
   await this.db.pool.query("UPDATE stock_sources SET healthy=false,last_error='STOCK_REFRESH_FAILED' WHERE warehouse_id=$1",[this.source.settings.warehouseId]);
   await this.db.pool.query("UPDATE warehouse_external_ids SET sync_status='error' WHERE provider='cdek_ff' AND warehouse_id=$1 AND account_id=$2 AND external_id=$3",[this.source.settings.warehouseId,this.source.settings.accountId,this.source.settings.externalWarehouseId]);
   throw new DomainError('STOCK_REFRESH_FAILED',503);
  }
 }
 async apply(snapshot:StockSnapshot){
  const s=this.source.settings,now=this.clock();
  const sourceHash=hash(canonical([s.feedUrl,s.accountId,s.externalWarehouseId,s.environment]));
  if(+snapshot.generatedAt>+now+60000||+snapshot.generatedAt+s.maxAgeSeconds*1000<=+now)throw new DomainError('STOCK_SOURCE_STALE',503);
  return this.db.transaction(async tx=>{
   await lock(tx,'stock-source:'+s.warehouseId);
   if(!(await tx.query(`SELECT 1 FROM warehouse_external_ids x JOIN warehouses w ON w.id=x.warehouse_id
    WHERE w.id=$1 AND w.active AND x.provider='cdek_ff' AND x.account_id=$2 AND x.external_id=$3 FOR SHARE OF w,x`,[s.warehouseId,s.accountId,s.externalWarehouseId])).rowCount)throw new DomainError('STOCK_WAREHOUSE_SCOPE_MISMATCH');
   const previous=(await tx.query('SELECT * FROM stock_sources WHERE warehouse_id=$1 FOR UPDATE',[s.warehouseId])).rows[0];
   if(previous&&previous.source_hash!==sourceHash)throw new DomainError('STOCK_SOURCE_CHANGE_REQUIRES_REVIEW');
   if(previous&&+previous.generated_at>+snapshot.generatedAt)throw new DomainError('STOCK_SOURCE_REGRESSED');
   if(previous&&+previous.generated_at===+snapshot.generatedAt&&previous.payload_hash!==snapshot.digest)throw new DomainError('STOCK_SOURCE_VERSION_CONFLICT');
   const products=(await tx.query('SELECT id,sku FROM products ORDER BY sku FOR UPDATE')).rows;
   const known=new Set(products.map(p=>p.sku)),unknown=snapshot.items.filter(i=>!known.has(i.sku)).map(i=>i.sku);
   const expires=new Date(Math.min(+snapshot.generatedAt+s.maxAgeSeconds*1000,+now+s.pollSeconds*3*1000));
   const changed=!previous||+previous.generated_at<+snapshot.generatedAt;
   await tx.query(`INSERT INTO stock_sources(warehouse_id,source_hash,environment,generated_at,fetched_at,expires_at,payload_hash,unknown_skus)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(warehouse_id) DO UPDATE SET
    generated_at=excluded.generated_at,fetched_at=excluded.fetched_at,expires_at=excluded.expires_at,payload_hash=excluded.payload_hash,
    healthy=true,last_error=NULL,unknown_skus=excluded.unknown_skus`,[s.warehouseId,sourceHash,s.environment,snapshot.generatedAt,now,expires,snapshot.digest,unknown]);
   for(const p of products){
    const item=snapshot.items.find(i=>i.sku===p.sku),quantity=item?.quantity??0;
    const already=(await tx.query('SELECT 1 FROM stock_source_items WHERE warehouse_id=$1 AND product_id=$2',[s.warehouseId,p.id])).rowCount;
    if(!changed&&already)continue; // A repeated feed must never replenish a consumed balance.
    await tx.query(`INSERT INTO inventory_balances(product_id,warehouse_id,on_hand) VALUES($1,$2,0) ON CONFLICT DO NOTHING`,[p.id,s.warehouseId]);
    const balance=(await tx.query('SELECT reserved FROM inventory_balances WHERE product_id=$1 AND warehouse_id=$2 FOR UPDATE',[p.id,s.warehouseId])).rows[0];
    // A cached snapshot can predate a confirmed dispatch. Keep its local debit until
    // a provider generation after that dispatch; never infer a return from a cancellation.
    const consumed=(await tx.query("SELECT COALESCE(sum(quantity),0)::integer n FROM inventory_movements WHERE product_id=$1 AND warehouse_id=$2 AND kind='ship' AND created_at>=$3",[p.id,s.warehouseId,snapshot.generatedAt])).rows[0].n;
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
export async function runStockWorker(service:StockSync,signal:AbortSignal,report:(event:{event:string})=>void){
 while(!signal.aborted){
  try{await service.refresh();}catch{report({event:'stock.refresh_failed'});}
  if(signal.aborted)break;
  try{await delay(service.source.settings.pollSeconds*1000,undefined,{signal});}catch{if(!signal.aborted)throw new Error('Stock worker interrupted');}
 }
}
