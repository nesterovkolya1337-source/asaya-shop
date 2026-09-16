import {z} from 'zod';
import {Database,lock,type Tx} from './db.js';
import {DomainError} from './core.js';
import {normalizeCustomerPhone} from './customer-phone.js';

// Called inside YCP placement transaction. Contact association does not grant authentication.
export async function saveYcpCustomer(tx:Tx,orderId:string){
 const row=(await tx.query('SELECT customer_snapshot FROM orders WHERE id=$1',[orderId])).rows[0];
 const phone=normalizeCustomerPhone(row?.customer_snapshot?.phone??'');
 if(!phone)return;
 await lock(tx,'customer-orders:'+phone);
 const name=typeof row.customer_snapshot.name==='string'?row.customer_snapshot.name.slice(0,200):'';
 const email=z.email().max(254).safeParse(row.customer_snapshot.email);
 const profile=(await tx.query(`INSERT INTO customer_profiles(phone,name,email) VALUES($1,$2,$3)
  ON CONFLICT(phone) DO UPDATE SET phone=excluded.phone RETURNING id`,[phone,name,email.success?email.data.toLowerCase():''])).rows[0];
 await tx.query('UPDATE orders SET customer_id=$2,customer_phone_normalized=$3 WHERE id=$1',[orderId,profile.id,phone]);
}
export async function claimPhoneOrders(tx:Tx,userId:string){
 // Never accept a phone from the caller. Only the identity confirmed by AuthService.
 const identity=(await tx.query("SELECT i.destination FROM user_identities i JOIN users u ON u.id=i.user_id WHERE i.user_id=$1 AND i.channel='sms' AND i.verified_at IS NOT NULL AND u.role='customer' AND NOT u.disabled",[userId])).rows[0];
 if(!identity)return;
 await lock(tx,'customer-orders:'+identity.destination);
 const profile=(await tx.query(`INSERT INTO customer_profiles(phone,user_id) VALUES($1,$2)
  ON CONFLICT(phone) DO UPDATE SET user_id=excluded.user_id WHERE customer_profiles.user_id IS NULL OR customer_profiles.user_id=excluded.user_id RETURNING id`,[identity.destination,userId])).rows[0];
 if(!profile)throw new DomainError('CUSTOMER_PROFILE_REQUIRES_REVIEW',409);
 const orders=(await tx.query(`SELECT o.id,o.checkout_id FROM orders o JOIN users guest ON guest.id=o.user_id
  WHERE o.customer_snapshot->>'source'='ycp' AND asaya_customer_phone(o.customer_snapshot->>'phone')=$2
  AND o.user_id<>$1 AND guest.disabled AND guest.role='customer'
  AND EXISTS(SELECT 1 FROM ycp_sessions y WHERE y.order_id=o.id AND y.placement_outcome='placed')
  AND NOT EXISTS(SELECT 1 FROM user_identities i WHERE i.user_id=guest.id)
  AND NOT EXISTS(SELECT 1 FROM customer_oauth_identities i WHERE i.user_id=guest.id)
  AND NOT EXISTS(SELECT 1 FROM customer_order_claims c WHERE c.order_id=o.id)
  ORDER BY o.id FOR UPDATE OF o`,[userId,identity.destination])).rows;
 for(const order of orders){
  await tx.query("INSERT INTO customer_order_claims(order_id,user_id,method) VALUES($1,$2,'verified_sms')",[order.id,userId]);
  await tx.query('UPDATE orders SET user_id=$2,customer_id=$3,customer_phone_normalized=$4 WHERE id=$1',[order.id,userId,profile.id,identity.destination]);
  await tx.query('UPDATE checkout_sessions SET user_id=$2 WHERE id=$1',[order.checkout_id,userId]);
 }
}
export class CustomerAccount{
 constructor(private db:Database){}
 async claim(userId:string){await this.db.transaction(tx=>claimPhoneOrders(tx,userId));}
 async profile(userId:string){
  const row=(await this.db.pool.query(`SELECT COALESCE(p.name,'') AS name,COALESCE(p.email,'') AS email,i.destination AS phone
   FROM users u JOIN user_identities i ON i.user_id=u.id AND i.channel='sms' AND i.verified_at IS NOT NULL
   LEFT JOIN customer_profiles p ON p.user_id=u.id WHERE u.id=$1 AND u.role='customer' AND NOT u.disabled`,[userId])).rows[0];
  if(!row)throw new DomainError('UNAUTHENTICATED',401);return row as {name:string;email:string;phone:string};
 }
 async save(userId:string,raw:unknown){
  const input=z.object({name:z.string().trim().max(200),email:z.union([z.literal(''),z.email().max(254)]).transform(v=>v.toLowerCase())}).strict().parse(raw);
  await this.claim(userId);await this.profile(userId);
  await this.db.pool.query('UPDATE customer_profiles SET name=$2,email=$3,updated_at=now() WHERE user_id=$1',[userId,input.name,input.email]);
  // Optional profile email is not an authentication identity and cannot grant order access.
  return this.profile(userId);
 }
}
