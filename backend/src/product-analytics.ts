import {z} from 'zod';
import {Database,lock} from './db.js';
import {DomainError} from './core.js';

const types=['product_impression','product_open','product_click','add_to_cart','checkout_started'] as const;
const input=z.object({anonymousSessionId:z.uuid(),events:z.array(z.object({eventId:z.uuid(),type:z.enum(types),sku:z.string().min(1).max(100)}).strict()).min(1).max(20)}).strict();
export class ProductAnalytics {
 constructor(private db:Database){}
 async ingest(raw:unknown){
  const data=input.parse(raw);
  return this.db.transaction(async tx=>{
   await lock(tx,'analytics:'+data.anonymousSessionId);
   let count=Number((await tx.query('SELECT count(*) AS n FROM product_analytics_events WHERE anonymous_session_id=$1',[data.anonymousSessionId])).rows[0].n);
   for(const e of data.events){
    // SKU and category come from a real published product; no free-form metadata,
    // page URL, customer cookie, IP, contact or provider/payment identifier is stored.
    const inserted=await tx.query(`INSERT INTO product_analytics_events(event_id,anonymous_session_id,event_type,product_id,sku,product_name,category)
     SELECT $1,$2,$3,p.id,p.sku,pe.published->>'name',pe.published->'content'->>'category'
     FROM products p JOIN product_editor pe ON pe.product_id=p.id
     WHERE p.sku=$4 AND p.active AND pe.published IS NOT NULL
     ON CONFLICT DO NOTHING`,[e.eventId,data.anonymousSessionId,e.type,e.sku]);
    count+=inserted.rowCount??0;if(count>500)throw new DomainError('ANALYTICS_LIMIT',429);
   }
   return {ok:true};
  });
 }
}
