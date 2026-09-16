import {setTimeout as delay} from 'node:timers/promises';

type WorkerReport={event:'reservations.expired';count:number}|{event:'reservations.expiry_failed'};
export async function runReservationWorker(options:{
 expire:()=>Promise<number>;signal:AbortSignal;intervalMs:number;
 report:(report:WorkerReport)=>void;
 wait?:(ms:number,signal:AbortSignal)=>Promise<void>;
}){
 if(!Number.isInteger(options.intervalMs)||options.intervalMs<1000||options.intervalMs>300000)throw new Error('Invalid reservation worker interval');
 const wait=options.wait??((ms,signal)=>delay(ms,undefined,{signal}));
 while(!options.signal.aborted){
  // Await each batch before scheduling the next: slow runs never overlap.
  try{const count=await options.expire();options.report({event:'reservations.expired',count});}
  catch{options.report({event:'reservations.expiry_failed'});}
  if(options.signal.aborted)break;
  try{await wait(options.intervalMs,options.signal);}
  catch(error){if(!options.signal.aborted)throw error;}
 }
}
