import {Database} from './db.js';
// No scheduler may erase customer/order data in v10.1, including obsolete direct callers.
export async function runRetentionWorker(_db:Database,_scope:{accountId:string;environment:'test'|'production'},_signal:AbortSignal,_report:(e:{event:string;count?:number})=>void):Promise<void>{
 throw new Error('AUTOMATIC_RETENTION_DISABLED');
}
