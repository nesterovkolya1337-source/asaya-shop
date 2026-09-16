import {setTimeout as delay} from 'node:timers/promises';
import {z} from 'zod';
import {Database} from './db.js';
import {processOne} from './outbox.js';
import {FulfillmentDispatch,type FulfillmentBinding} from './fulfillment-dispatch.js';
export async function runFulfillmentWorker(db:Database,service:FulfillmentDispatch,binding:FulfillmentBinding,signal:AbortSignal,report:(event:{event:string})=>void){
 const scope={accountId:binding.ycpAccountId,environment:binding.environment};let nextSync=0;
 while(!signal.aborted){
  try{
   for(let n=0;n<10&&!signal.aborted;n++){
    const ran=await processOne(db,{'order.paid':async raw=>{const {orderId}=z.object({orderId:z.uuid()}).strict().parse(raw);if((await service.submit(orderId)).state!=='created')throw new Error('FULFILLMENT_REVIEW');}},new Date(),scope);
    if(!ran)break;
   }
   // The FF contract documents periodic GET, not a warehouse webhook. Once FF
   // has handed the parcel over, transport updates use CDEK webhook/daily fallback.
   if(Date.now()>=nextSync){
    nextSync=Date.now()+10*60000;
    const jobs=(await db.pool.query(`SELECT j.order_id FROM fulfillment_jobs j LEFT JOIN order_logistics l ON l.order_id=j.order_id
     WHERE j.state='created' AND j.account_id=$1 AND j.environment=$2 AND (l.fulfillment_synced_at IS NULL OR l.fulfillment_synced_at<now()-interval '10 minutes')
     AND (COALESCE(l.fulfillment_status,'queued') NOT IN ('cancelled','returning','handed_to_delivery') OR l.tracking_number IS NULL)
     ORDER BY l.fulfillment_synced_at NULLS FIRST,j.order_id LIMIT 50`,[scope.accountId,scope.environment])).rows;
    for(const job of jobs){if(signal.aborted)break;try{await service.sync(job.order_id);}catch{report({event:'fulfillment.sync_failed'});}}
   }
  }catch{report({event:'fulfillment.batch_failed'});}
  if(signal.aborted)break;
  try{await delay(30000,undefined,{signal});}catch{if(!signal.aborted)throw new Error('Fulfillment worker interrupted');}
 }
}
