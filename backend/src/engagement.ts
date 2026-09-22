import {normalizeCustomerPhone} from './customer-phone.js';

import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {Database,type Tx} from './db.js';
import {DomainError} from './core.js';
import {claimPhoneOrders} from './customer-account.js';
import {liveMarketing} from './marketing.js';
async function customer(tx:Tx,user:string){
 await claimPhoneOrders(tx,user);
 const r=(await tx.query(`SELECT p.* FROM customer_profiles p JOIN users u ON u.id=p.user_id
  JOIN user_identities i ON i.user_id=u.id AND i.channel='sms' AND i.verified_at IS NOT NULL AND i.destination=p.phone
  WHERE u.id=$1 AND u.role='customer' AND NOT u.disabled FOR UPDATE OF p`,[user])).rows[0];
 if(!r)throw new DomainError('UNAUTHENTICATED',401);return r;
}
async function staff(tx:Tx,id:string){
 if(!(await tx.query("SELECT 1 FROM users WHERE id=$1 AND role='admin' AND NOT disabled",[id])).rowCount)throw new DomainError('FORBIDDEN',403);
}
const purchased=`o.payment_status='paid' AND o.status<>'cancelled' AND EXISTS(SELECT 1 FROM payments pay WHERE pay.order_id=o.id AND pay.status='paid')`;
async function verified(tx:Tx,customerId:string,productId:string){
 return !!(await tx.query(`SELECT 1 FROM orders o JOIN order_items i ON i.order_id=o.id
  WHERE o.customer_id=$1 AND i.product_id=$2 AND ${purchased} LIMIT 1`,[customerId,productId])).rowCount;
}
export async function earnReferral(tx:Tx,orderId:string){
 const r=(await tx.query(`SELECT r.*,a.phone inviter_phone,b.phone invitee_phone FROM orders o
  JOIN customer_referrals r ON r.invitee_id=o.customer_id JOIN customer_profiles a ON a.id=r.inviter_id
  JOIN customer_profiles b ON b.id=r.invitee_id WHERE o.id=$1 AND ${purchased}
  AND o.subtotal_minor>0 AND o.created_at>=r.created_at
  AND NOT EXISTS(SELECT 1 FROM orders earlier WHERE earlier.customer_id=o.customer_id AND earlier.id<>o.id
    AND earlier.status<>'cancelled' AND earlier.payment_status IN ('paid','partially_refunded','refunded') AND (earlier.created_at,earlier.id)<(o.created_at,o.id))`,[orderId])).rows[0];
 if(!r||r.inviter_id===r.invitee_id||normalizeCustomerPhone(r.inviter_phone)===normalizeCustomerPhone(r.invitee_phone))return;
 await tx.query('SELECT id FROM customer_profiles WHERE id=$1 FOR UPDATE',[r.inviter_id]);
 await tx.query(`INSERT INTO loyalty_ledger(id,customer_id,type,points,source,source_key,order_id,description)
  VALUES($1,$2,'referral_reward',200,'confirmed_payment',$3,$4,'Баллы за приглашённого покупателя')
  ON CONFLICT(source_key) DO NOTHING`,[randomUUID(),r.inviter_id,'referral:'+r.invitee_id,orderId]);
}
export class Engagement {
 constructor(private db:Database){}
 async submit(user:string,raw:unknown){
  const d=z.object({productId:z.uuid(),rating:z.number().int().min(1).max(5),body:z.string().trim().min(3).max(5000)}).strict().parse(raw);
  return this.db.transaction(async tx=>{
   const c=await customer(tx,user);
   if(!await verified(tx,c.id,d.productId))throw new DomainError('VERIFIED_PURCHASE_REQUIRED',403);
   if(!(await tx.query('SELECT 1 FROM products WHERE id=$1 AND archived_at IS NULL',[d.productId])).rowCount)throw new DomainError('PRODUCT_NOT_FOUND',404);
   const r=await tx.query(`INSERT INTO product_reviews(id,customer_id,product_id,rating,body) VALUES($1,$2,$3,$4,$5)
    ON CONFLICT(customer_id,product_id) DO NOTHING RETURNING id`,[randomUUID(),c.id,d.productId,d.rating,d.body]);
   return {created:!!r.rowCount};
  });
 }
 async publicReviews(sku:string){
  z.string().min(1).max(100).parse(sku);
  return {items:(await this.db.pool.query(`SELECT r.id,r.rating,r.body,r.reply,r.created_at FROM product_reviews r
   JOIN products p ON p.id=r.product_id WHERE p.sku=$1 AND p.active AND p.archived_at IS NULL
   AND r.status='published' ORDER BY r.created_at DESC LIMIT 100`,[sku])).rows};
 }
 async reviews(actor:string){
  return this.db.transaction(async tx=>{await staff(tx,actor);return {items:(await tx.query(`SELECT r.*,p.name product_name,p.sku,
   c.name customer_name,EXISTS(SELECT 1 FROM loyalty_ledger l WHERE l.source_key='review:'||r.customer_id::text||':'||r.product_id::text) rewarded
   FROM product_reviews r JOIN products p ON p.id=r.product_id JOIN customer_profiles c ON c.id=r.customer_id ORDER BY r.created_at DESC LIMIT 500`)).rows};});
 }
 async moderate(actor:string,id:string,raw:unknown){
  z.uuid().parse(id);
  const d=z.object({action:z.enum(['show','hide','reject','reply']),reason:z.enum(['spam','duplicate','abuse']).optional(),reply:z.string().trim().max(5000).optional()}).strict().parse(raw);
  if(d.action==='reject'&&!d.reason||d.action==='reply'&&d.reply===undefined)throw new DomainError('INVALID_INPUT',400);
  return this.db.transaction(async tx=>{
   await staff(tx,actor);const r=(await tx.query('SELECT * FROM product_reviews WHERE id=$1 FOR UPDATE',[id])).rows[0];
   if(!r)throw new DomainError('REVIEW_NOT_FOUND',404);
   if(d.action==='reply')await tx.query('UPDATE product_reviews SET reply=$2,updated_at=now(),moderated_by=$3 WHERE id=$1',[id,d.reply,actor]);
   else{
    const status=d.action==='show'?'published':d.action==='hide'?'hidden':'rejected';
    await tx.query('UPDATE product_reviews SET status=$2,rejection_reason=$3,updated_at=now(),moderated_by=$4 WHERE id=$1',[id,status,d.action==='reject'?d.reason:null,actor]);
    if(d.action!=='reject'&&await verified(tx,r.customer_id,r.product_id)){
     await tx.query('SELECT id FROM customer_profiles WHERE id=$1 FOR UPDATE',[r.customer_id]);
     await tx.query(`INSERT INTO loyalty_ledger(id,customer_id,type,points,source,source_key,description)
      VALUES($1,$2,'review_reward',100,'moderated_review',$3,'Баллы за отзыв') ON CONFLICT(source_key) DO NOTHING`,
      [randomUUID(),r.customer_id,'review:'+r.customer_id+':'+r.product_id]);
    }
   }
   await tx.query("INSERT INTO audit_log(id,actor_id,action,entity_id,detail) VALUES($1,$2,'review.moderated',$3,$4)",[randomUUID(),actor,id,{action:d.action}]);
   return {ok:true};
  });
 }
 async attach(user:string,raw:unknown){
  const {code}=z.object({code:z.uuid()}).strict().parse(raw);
  return this.db.transaction(async tx=>{
   const c=await customer(tx,user),inviter=(await tx.query('SELECT c.customer_id,p.phone FROM referral_codes c JOIN customer_profiles p ON p.id=c.customer_id WHERE c.code=$1',[code])).rows[0];
   if(!inviter)throw new DomainError('REFERRAL_NOT_FOUND',404);
   if(inviter.customer_id===c.id||normalizeCustomerPhone(inviter.phone)===normalizeCustomerPhone(c.phone))throw new DomainError('SELF_REFERRAL',409);
   const existing=(await tx.query('SELECT inviter_id FROM customer_referrals WHERE invitee_id=$1',[c.id])).rows[0];
   if(existing){if(existing.inviter_id!==inviter.customer_id)throw new DomainError('REFERRAL_ALREADY_SET',409);return {ok:true};}
   if((await tx.query('SELECT 1 FROM orders WHERE customer_id=$1 LIMIT 1',[c.id])).rowCount)throw new DomainError('REFERRAL_NEW_CUSTOMER_ONLY',409);
   await tx.query('INSERT INTO customer_referrals(invitee_id,inviter_id) VALUES($1,$2)',[c.id,inviter.customer_id]);return {ok:true};
  });
 }
 async account(user:string){
  return this.db.transaction(async tx=>{
   const c=await customer(tx,user);
   await tx.query('INSERT INTO referral_codes(customer_id,code) VALUES($1,$2) ON CONFLICT DO NOTHING',[c.id,randomUUID()]);
   const code=(await tx.query('SELECT code FROM referral_codes WHERE customer_id=$1',[c.id])).rows[0].code;
   const products=(await tx.query(`SELECT p.id,p.sku,p.name,max(o.created_at) last_purchase,
    (SELECT slug FROM storefront_mappings m WHERE m.product_id=p.id AND m.approved LIMIT 1) slug,
    EXISTS(SELECT 1 FROM product_reviews r WHERE r.customer_id=$1 AND r.product_id=p.id) reviewed
    FROM orders o JOIN order_items i ON i.order_id=o.id JOIN products p ON p.id=i.product_id
    WHERE o.customer_id=$1 AND ${purchased} AND p.archived_at IS NULL GROUP BY p.id`,[c.id])).rows;
   const intervals=(await liveMarketing(tx)).replenishment??{};
   return {code,products,reminders:products.filter(p=>intervals[p.id]&&Date.now()>=+new Date(p.last_purchase)+intervals[p.id]!*86400000)};
  });
 }
}
