import { randomUUID } from 'node:crypto';
import { Database } from './db.js';
export type OutboxHandler=(payload:unknown,context:{idempotencyKey:string})=>Promise<void>;
export async function processOne(db:Database,handlers:Record<string,OutboxHandler>,now=new Date(),scope?:{accountId:string;environment:'test'|'production'}) {
 const kinds=Object.keys(handlers);if(!kinds.length)return false;
 const lease=randomUUID();
 const row=await db.transaction(async tx=>{
  const r=(await tx.query(`SELECT * FROM integration_outbox WHERE
   kind=ANY($2::text[]) AND ((status='pending' AND available_at<=$1) OR (status='processing' AND lease_until<=$1))
   AND ($3::text IS NULL OR EXISTS(SELECT 1 FROM ycp_sessions y WHERE y.order_id=integration_outbox.aggregate_id AND y.account_id=$3 AND y.environment=$4))
   ORDER BY available_at,id LIMIT 1 FOR UPDATE SKIP LOCKED`,[now,kinds,scope?.accountId??null,scope?.environment??null])).rows[0];
  if(!r)return null;
  await tx.query("UPDATE integration_outbox SET status='processing',attempts=attempts+1,lease_until=$2,lease_token=$3 WHERE id=$1",[r.id,new Date(now.getTime()+60_000),lease]);
  return {...r,attempts:r.attempts+1};
 });
 if(!row)return false;
 try {
  const handler=handlers[row.kind];if(!handler)throw new Error('No handler registered');
  await handler(row.payload,{idempotencyKey:row.dedupe_key});
  await db.pool.query("UPDATE integration_outbox SET status='done',lease_until=NULL,lease_token=NULL,last_error=NULL WHERE id=$1 AND lease_token=$2",[row.id,lease]);
 }catch {
  // Raw provider messages may contain PII or credentials; persist only a safe classification.
  await db.pool.query(`UPDATE integration_outbox SET status=$3,available_at=$4,lease_until=NULL,lease_token=NULL,last_error='HANDLER_FAILED'
   WHERE id=$1 AND lease_token=$2`,[row.id,lease,row.attempts>=8?'failed':'pending',new Date(now.getTime()+Math.min(3600,2**row.attempts)*1000)]);
 }
 return true;
}
