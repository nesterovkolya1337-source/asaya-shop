import {setTimeout as delay} from 'node:timers/promises';
import {Database} from './db.js';
import {purgeUnpaidContacts} from './order-retention.js';
export async function runRetentionWorker(db:Database,scope:{accountId:string;environment:'test'|'production'},signal:AbortSignal,report:(e:{event:string;count?:number})=>void){
 while(!signal.aborted){
  try{let total=0;for(let n=0;n<10&&!signal.aborted;n++){const count=await purgeUnpaidContacts(db,scope);total+=count;if(count<100)break;}if(total)report({event:'unpaid_contacts.purged',count:total});}
  catch{report({event:'unpaid_contacts.failed'});}
  if(signal.aborted)break;
  try{await delay(86400000,undefined,{signal});}catch{if(!signal.aborted)throw new Error('Retention worker interrupted');}
 }
}
