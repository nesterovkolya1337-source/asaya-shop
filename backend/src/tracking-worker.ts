import {setTimeout as delay} from 'node:timers/promises';
import type {OrderTracking} from './order-tracking.js';
export async function runTrackingWorker(service:OrderTracking,signal:AbortSignal,report:(result:{event:'cdek.refresh_failed'|'cdek.batch_failed'})=>void){
 while(!signal.aborted){
  try{for(const id of await service.due()){
   if(signal.aborted)break;
   try{await service.refresh(id);}catch{await service.failed(id);report({event:'cdek.refresh_failed'});}
  }}catch{report({event:'cdek.batch_failed'});}
  if(signal.aborted)break;
  try{await delay(30000,undefined,{signal});}catch{if(!signal.aborted)throw new Error('Tracking worker interrupted');}
 }
}
