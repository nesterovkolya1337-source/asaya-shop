import {z} from 'zod';
import {Database} from './db.js';
import {DomainError} from './core.js';
export const reviewKinds=['payment.late_review','ycp.placement_after_cancel','payment.refund_review','payment.void_review','ycp.return_review','ycp.cod_payment_review','ycp.payment_reconcile_required','fulfillment.cancel_review'];
export class AdminIntegration{
 constructor(private db:Database){}
 async list(actor:string,raw:unknown){
  if(!(await this.db.pool.query("SELECT 1 FROM users WHERE id=$1 AND role='admin' AND NOT disabled",[actor])).rowCount)throw new DomainError('FORBIDDEN',403);
  const q=z.object({filter:z.enum(['all','errors','review']).default('all'),cursor:z.uuid().optional()}).strict().parse(raw);
  if(q.cursor&&!(await this.db.pool.query('SELECT 1 FROM integration_outbox WHERE id=$1',[q.cursor])).rowCount)throw new DomainError('INVALID_CURSOR',400);
  const rows=(await this.db.pool.query(`SELECT e.id,e.created_at,e.status,e.attempts,e.available_at,
   CASE WHEN e.kind=ANY($1::text[]) THEN e.kind ELSE 'integration.event' END AS kind,
   e.kind=ANY($1::text[]) AS review,
   CASE WHEN e.last_error IS NOT NULL THEN 'HANDLER_FAILED' ELSE NULL END AS error,
   o.id AS order_id,o.public_number,
   s.external_order_id,s.session_id
   FROM integration_outbox e LEFT JOIN orders o ON o.id=e.aggregate_id LEFT JOIN ycp_sessions s ON s.order_id=o.id
   WHERE ((e.status<>'done' AND (e.last_error IS NOT NULL OR e.status='failed')) OR e.kind=ANY($1::text[]))
   AND ($2='all' OR ($2='review' AND e.kind=ANY($1::text[])) OR ($2='errors' AND e.status<>'done' AND (e.last_error IS NOT NULL OR e.status='failed')))
   AND ($3::uuid IS NULL OR (e.created_at,e.id)<(SELECT created_at,id FROM integration_outbox WHERE id=$3))
   ORDER BY e.created_at DESC,e.id DESC LIMIT 21`,[reviewKinds,q.filter,q.cursor??null])).rows;
  const items=rows.slice(0,20).map(r=>({id:r.id,createdAt:r.created_at,status:r.status,attempts:r.attempts,
   nextAttemptAt:r.status==='pending'&&r.attempts>0?r.available_at:null,kind:r.kind,review:r.review,error:r.error,
   order:r.order_id?{id:r.order_id,number:r.public_number}:null,
   ycp:r.session_id?{sessionId:r.session_id,orderId:r.external_order_id}:null}));
  return {items,nextCursor:rows.length>20?items.at(-1)!.id:null};
 }
}
