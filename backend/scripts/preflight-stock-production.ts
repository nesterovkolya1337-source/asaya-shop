// Read-only preflight. Uses the existing YML contract; never starts StockSync.
import {readFile} from 'node:fs/promises';
import {Database} from '../src/db.js';
import {CdekStockFeed} from '../src/cdek-stock-feed.js';
import {stockSourceHash} from '../src/stock-state.js';
let db:Database|undefined;
try{
 const path=process.env.CDEK_STOCK_SETTINGS_FILE;
 if(!path||!process.env.DATABASE_URL)throw new Error('STOCK_PREFLIGHT_CONFIG_MISSING');
 const source=new CdekStockFeed(JSON.parse(await readFile(path,'utf8')),async(input,init)=>{
  const response=await fetch(input,init);
  console.log(JSON.stringify({stage:'provider',httpStatus:response.status,contentType:response.headers.get('content-type')}));
  return response;
 });
 if(source.settings.environment!=='production')throw new Error('STOCK_PREFLIGHT_NOT_PRODUCTION');
 db=new Database(process.env.DATABASE_URL);
 const s=source.settings;
 const binding=(await db.pool.query(`SELECT 1 FROM warehouse_external_ids x JOIN warehouses w ON w.id=x.warehouse_id
  WHERE w.id=$1 AND w.active AND x.provider='cdek_ff' AND x.account_id=$2 AND x.external_id=$3`,[s.warehouseId,s.accountId,s.externalWarehouseId])).rowCount;
 if(!binding)throw new Error('STOCK_WAREHOUSE_SCOPE_MISMATCH');
 const prior=(await db.pool.query('SELECT source_hash FROM stock_sources WHERE warehouse_id=$1',[s.warehouseId])).rows[0];
 if(prior&&prior.source_hash!==stockSourceHash(s))throw new Error('STOCK_SOURCE_CHANGE_REQUIRES_REVIEW');
 const snapshot=await source.read(),now=Date.now();
 const skus=new Set((await db.pool.query('SELECT sku FROM products')).rows.map(r=>r.sku));
 const unknown=snapshot.items.filter(i=>!skus.has(i.sku)).map(i=>i.sku);
 console.log(JSON.stringify({stage:'snapshot',warehouse:s.externalWarehouseId,generatedAt:snapshot.generatedAt,ageSeconds:Math.floor((now-Number(snapshot.generatedAt))/1000),maxAgeSeconds:s.maxAgeSeconds,offers:snapshot.items.length,unknownSkus:unknown,examples:snapshot.items.filter(i=>skus.has(i.sku)&&i.quantity>0).slice(0,5),productionWritten:false}));
 if(Number(snapshot.generatedAt)>now+60000||Number(snapshot.generatedAt)+s.maxAgeSeconds*1000<=now)throw new Error('STOCK_SOURCE_STALE');
 if(unknown.length)throw new Error('STOCK_PREFLIGHT_UNKNOWN_SKUS');
 console.log('STOCK_PREFLIGHT_PASSED');
}catch(error){
 const known=['STOCK_PREFLIGHT_CONFIG_MISSING','STOCK_PREFLIGHT_NOT_PRODUCTION','STOCK_WAREHOUSE_SCOPE_MISMATCH','STOCK_SOURCE_CHANGE_REQUIRES_REVIEW','STOCK_SOURCE_STALE','STOCK_PREFLIGHT_UNKNOWN_SKUS','STOCK_SOURCE_UNAVAILABLE','STOCK_SOURCE_RATE_LIMITED'];
 const code=error instanceof Error?error.message:'';
 console.error(known.includes(code)?code:'STOCK_PREFLIGHT_FAILED');process.exitCode=1;
}finally{await db?.close();}
