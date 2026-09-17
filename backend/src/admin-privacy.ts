import {createHash,randomUUID} from 'node:crypto';
import {z} from 'zod';
import {Database,type Tx} from './db.js';
import {DomainError} from './core.js';

const scopeSchema=z.enum(['order_contacts','profile_optional']);
type Scope=z.infer<typeof scopeSchema>;
// Deliberately bounded manual operations. Financial records and identities are not deleted.
export class AdminPrivacy {
 constructor(private db:Database){}
 private async state(tx:Tx,actor:string,id:string,scope:Scope){
  if(!(await tx.query("SELECT id FROM users WHERE id=$1 AND role='admin' AND NOT disabled FOR SHARE",[actor])).rowCount)throw new DomainError('FORBIDDEN',403);
  const o=(await tx.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE',[id])).rows[0];
  if(!o)throw new DomainError('ORDER_NOT_FOUND',404);
  const profile=o.customer_id?(await tx.query('SELECT * FROM customer_profiles WHERE id=$1 FOR UPDATE',[o.customer_id])).rows[0]:null;
  const linked=profile?(await tx.query('SELECT id,public_number,legal_hold FROM orders WHERE customer_id=$1 ORDER BY id FOR SHARE',[profile.id])).rows:[];
  const checkout=(await tx.query('SELECT snapshot FROM checkout_sessions WHERE id=$1 FOR UPDATE',[o.checkout_id])).rows[0];
  const facts=(await tx.query(`SELECT
   EXISTS(SELECT 1 FROM payments WHERE order_id=$1) AS payments,
   EXISTS(SELECT 1 FROM fulfillment_jobs WHERE order_id=$1) AS fulfillment,
   EXISTS(SELECT 1 FROM order_logistics WHERE order_id=$1) AS logistics,
   EXISTS(SELECT 1 FROM order_dispatch WHERE order_id=$1) AS dispatch,
   EXISTS(SELECT 1 FROM shipments WHERE order_id=$1) AS shipments,
   EXISTS(SELECT 1 FROM order_status_history WHERE order_id=$1 AND source='ycp' AND kind='order' AND status='cancelled') AS cancelled`,[id])).rows[0];
  let blocked:string|null=null;
  if(o.legal_hold||scope==='profile_optional'&&linked.some(r=>r.legal_hold))blocked='LEGAL_HOLD';
  else if(scope==='profile_optional'&&!profile)blocked='NO_CUSTOMER_PROFILE';
  else if(scope==='order_contacts'&&(o.customer_snapshot?.source!=='ycp'||o.status!=='cancelled'||!['cancelled','failed'].includes(o.payment_status)||!facts.cancelled))blocked='ORDER_NOT_DEFINITIVELY_CANCELLED';
  else if(scope==='order_contacts'&&(facts.payments||facts.fulfillment||facts.logistics||facts.dispatch||facts.shipments))blocked='RECORDS_REQUIRE_RETENTION_REVIEW';
  const revision=createHash('sha256').update(JSON.stringify({o,profile,linked,checkout,facts,scope})).digest('hex');
  return {o,profile,revision,blocked,view:{scope,revision,blocked,confirmation:o.public_number,
   orders:scope==='profile_optional'?linked.map(r=>({id:r.id,number:r.public_number})):[{id:o.id,number:o.public_number}],
   profileId:profile?.id??null,
   clears:scope==='order_contacts'?['order.customer_contact','order.delivery_contact','checkout.customer_delivery']:['profile.optional_name','profile.optional_email'],
   preserves:['order_items','prices_totals','payment_receipt_records','status_history','audit','login_phone_and_identities','other_provider_records'],
   alreadyCleared:scope==='order_contacts'?!!o.pii_purged_at:!!profile&&!profile.name&&!profile.email}};
 }
 async preview(actor:string,id:string,raw:unknown){
  z.uuid().parse(id);const {scope}=z.object({scope:scopeSchema}).strict().parse(raw);
  return this.db.transaction(async tx=>(await this.state(tx,actor,id,scope)).view);
 }
 async apply(actor:string,id:string,raw:unknown){
  z.uuid().parse(id);
  const input=z.object({scope:scopeSchema,revision:z.string().regex(/^[a-f0-9]{64}$/),confirmation:z.string().max(100),confirmed:z.literal(true),permittedContactsConfirmed:z.literal(true),reason:z.enum(['customer_request','correction','duplicate'])}).strict().parse(raw);
  const result=await this.db.transaction(async tx=>{
   const s=await this.state(tx,actor,id,input.scope);
   const error=s.blocked??(input.confirmation!==s.o.public_number?'CONFIRMATION_MISMATCH':s.revision!==input.revision?'PRIVACY_PREVIEW_STALE':null);
   const audit=async(outcome:string)=>tx.query("INSERT INTO audit_log(id,actor_id,action,entity_id,detail) VALUES($1,$2,'privacy.manual',$3,$4)",[randomUUID(),actor,id,{scope:input.scope,reason:input.reason,result:outcome,profileId:s.profile?.id??null}]);
   if(error){await audit(error);return {error};}
   if(s.view.alreadyCleared){await audit('already_cleared');return {ok:true};}
   if(input.scope==='profile_optional')await tx.query("UPDATE customer_profiles SET name='',email='',updated_at=now() WHERE id=$1",[s.profile.id]);
   else {
    await tx.query(`UPDATE orders SET customer_snapshot=(customer_snapshot-'name'-'phone'-'email'-'verifiedContacts')||'{"redacted":true}',
     delivery_snapshot=(delivery_snapshot-'address')||jsonb_build_object('redacted',true,'ycp',COALESCE(delivery_snapshot->'ycp','{}')-'address'),
     customer_phone_normalized=NULL,pii_purged_at=now() WHERE id=$1`,[id]);
    await tx.query("UPDATE checkout_sessions SET snapshot=jsonb_set(snapshot-'customer','{delivery}',COALESCE(snapshot->'delivery','{}')-'address') WHERE id=$1",[s.o.checkout_id]);
   }
   await audit('cleared');return {ok:true};
  });
  if(result.error)throw new DomainError(result.error,409);return {ok:true};
 }
}
