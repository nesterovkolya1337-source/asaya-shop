import {z} from 'zod';
import {Database} from '../src/db.js';
import {DomainError} from '../src/core.js';
import {CdekDeliveryClient,cdekTrackingFromEnv} from '../src/cdek-delivery.js';
import {OrderTracking} from '../src/order-tracking.js';

// Explicit operator fallback for one already bound order. No migration, shipment
// creation, inferred order matching, payment change or subscription mutation.
async function main(){
 const [mode,rawId,...extra]=process.argv.slice(2);
 if(mode!=='--refresh'||extra.length||!z.uuid().safeParse(rawId).success)throw new DomainError('USE_REFRESH_ORDER_UUID',400);
 const config=cdekTrackingFromEnv(process.env);
 if(!config||!process.env.DATABASE_URL)throw new DomainError('CDEK_TRACKING_CONFIG_REQUIRED',400);
 const db=new Database(process.env.DATABASE_URL);
 const tracking=new OrderTracking(db,new CdekDeliveryClient(config.settings),{accountId:config.settings.account,environment:config.settings.environment});
 try{await tracking.refresh(rawId!);return {event:'cdek.order_refreshed',orderId:rawId};}
 finally{await db.close();}
}
try{console.log(JSON.stringify(await main()));}
catch(error){console.error(JSON.stringify({event:'cdek.refresh_failed',code:error instanceof DomainError?error.code:'CDEK_REFRESH_FAILED'}));process.exitCode=1;}
