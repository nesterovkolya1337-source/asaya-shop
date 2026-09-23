import {requireSmsConsent,SmsConsent,type SmsConsentInput} from './sms-consent.js';
import { randomInt,randomBytes,randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Database,lock,type Tx } from './db.js';
import { DomainError,equal,hash,mac } from './core.js';
import {normalizeCustomerPhone} from './customer-phone.js';
import {otpPolicy,type OtpPolicy} from './otp-policy.js';
import {claimPhoneOrders} from './customer-account.js';

export type Channel='email'|'sms';
export interface OtpSender {
 sendOtp(input:{channel:Channel;destination:string;code:string;challengeId:string}):Promise<void|{provider:'smsaero';messageId:string;status:string}>;
}
export class DisabledOtpSender implements OtpSender {
 async sendOtp():Promise<void> { throw new DomainError('OTP_PROVIDER_NOT_CONFIGURED',503); }
}
export function destination(channel:Channel,value:string) {
 const normalized=value.trim();
 return channel==='email' ? z.email().max(254).parse(normalized).toLowerCase()
  : z.string().regex(/^\+7\d{10}$/).parse(normalizeCustomerPhone(normalized));
}
async function limit(tx:Tx,key:string,max:number,windowSeconds:number,now:Date) {
 await lock(tx,`limit:${key}`);
 const prior=(await tx.query('SELECT * FROM rate_limits WHERE bucket_key=$1',[key])).rows[0];
 if(prior && now.getTime()-new Date(prior.window_start).getTime()<windowSeconds*1000) {
  if(prior.count>=max) throw new DomainError('RATE_LIMITED',429);
  await tx.query('UPDATE rate_limits SET count=count+1 WHERE bucket_key=$1',[key]);
 } else await tx.query(`INSERT INTO rate_limits(bucket_key,window_start,count) VALUES($1,$2,1)
   ON CONFLICT(bucket_key) DO UPDATE SET window_start=excluded.window_start,count=1`,[key,now]);
}
export class AuthService {
 private policy:OtpPolicy;
 constructor(readonly db:Database,private secret:string,private sender:OtpSender,private clock=()=>new Date(),policy:Partial<OtpPolicy>={},private smsOnly=false) {
  if(secret.length<32) throw new Error('OTP secret must be at least 32 characters');
  this.policy=otpPolicy(policy);
 }
 async consentStatus(raw:string,ip:string){
  await this.db.transaction(tx=>limit(tx,`sms-consent-ip:${mac(this.secret,ip)}`,120,3600,this.clock()));
  return new SmsConsent(this.db).status(raw);
 }
 async request(channel:Channel,raw:string,ip:string,consent?:SmsConsentInput) {
  if(this.smsOnly&&channel!=='sms')throw new DomainError('SMS_REQUIRED',400);
  const target=destination(channel,raw); const now=this.clock(); const id=randomUUID();
  const code=randomInt(0,1_000_000).toString().padStart(6,'0');
  // IP limits persist even when the destination cooldown rejects the request.
  await this.db.transaction(tx=>limit(tx,`otp-ip:${mac(this.secret,ip)}`,this.policy.sendPerIpPerHour,3600,now));
  await this.db.transaction(async tx=>{
   await lock(tx,`identity:${channel}:${target}`);
   const latest=(await tx.query('SELECT created_at FROM otp_challenges WHERE channel=$1 AND destination=$2 ORDER BY created_at DESC LIMIT 1',[channel,target])).rows[0];
   if(latest&&now.getTime()-new Date(latest.created_at).getTime()<this.policy.resendSeconds*1000) throw new DomainError('OTP_COOLDOWN',429);
   await limit(tx,`otp-target:${mac(this.secret,channel+':'+target)}`,this.policy.sendPerPhonePerHour,3600,now);
   if(channel==='sms')await limit(tx,`otp-target-day:${mac(this.secret,channel+':'+target)}`,this.policy.sendPerPhonePerDay,86400,now);
   if(channel==='sms')await requireSmsConsent(tx,target,now,consent);
   await tx.query('UPDATE otp_challenges SET consumed_at=$3 WHERE channel=$1 AND destination=$2 AND consumed_at IS NULL',[channel,target,now]);
   await tx.query(`INSERT INTO otp_challenges(id,channel,destination,code_mac,expires_at,delivery_status,created_at)
    VALUES($1,$2,$3,$4,$5,'pending',$6)`,[id,channel,target,mac(this.secret,`${id}:${code}`),new Date(now.getTime()+this.policy.ttlSeconds*1000),now]);
  });
  try {
   const receipt=await this.sender.sendOtp({channel,destination:target,code,challengeId:id});
   await this.db.pool.query("UPDATE otp_challenges SET delivery_status='sent',provider=$2,provider_message_id=$3,provider_status=$4 WHERE id=$1",[id,receipt?.provider??null,receipt?.messageId??null,receipt?.status??null]);
  } catch {
   await this.db.pool.query("UPDATE otp_challenges SET delivery_status='failed',consumed_at=$2 WHERE id=$1",[id,this.clock()]);
   throw new DomainError('OTP_DELIVERY_UNAVAILABLE',503);
  }
  return {challengeId:id,expiresInSeconds:this.policy.ttlSeconds,retryAfterSeconds:this.policy.resendSeconds};
 }
 async verify(id:string,code:string,ip:string) {
  z.uuid().parse(id); z.string().regex(/^\d{6}$/).parse(code); const now=this.clock();
  await this.db.transaction(tx=>limit(tx,`otp-verify:${mac(this.secret,ip)}`,this.policy.verifyPerIpPerFiveMinutes,300,now));
  const result=await this.db.transaction(async tx=>{
   const ch=(await tx.query('SELECT * FROM otp_challenges WHERE id=$1 FOR UPDATE',[id])).rows[0];
   if(!ch||ch.consumed_at||ch.delivery_status!=='sent'||ch.attempts>=this.policy.maxAttempts||new Date(ch.expires_at)<=now||this.smsOnly&&ch.channel!=='sms') return null;
   await tx.query('UPDATE otp_challenges SET attempts=attempts+1 WHERE id=$1',[id]);
   if(!equal(ch.code_mac,mac(this.secret,`${id}:${code}`))) {
    if(ch.attempts+1>=this.policy.maxAttempts)await tx.query('UPDATE otp_challenges SET consumed_at=$2 WHERE id=$1',[id,now]);
    return null;
   }
   await tx.query('UPDATE otp_challenges SET consumed_at=$2 WHERE id=$1',[id,now]);
   await lock(tx,`user:${ch.channel}:${ch.destination}`);
   let identity=(await tx.query('SELECT user_id FROM user_identities WHERE channel=$1 AND destination=$2',[ch.channel,ch.destination])).rows[0];
   if(!identity) {
    identity={user_id:randomUUID()};
    await tx.query('INSERT INTO users(id) VALUES($1)',[identity.user_id]);
    await tx.query('INSERT INTO user_identities(channel,destination,user_id,verified_at) VALUES($1,$2,$3,$4)',[ch.channel,ch.destination,identity.user_id,now]);
   }
   const user=(await tx.query('SELECT id,role,disabled FROM users WHERE id=$1',[identity.user_id])).rows[0];
   // Staff accounts require a separate second-factor flow; customer OTP never grants staff access.
   if(user.disabled||user.role!=='customer') return null;
   if(ch.channel==='sms')await tx.query('UPDATE sms_consents SET customer_id=$2,verified_at=COALESCE(verified_at,$3) WHERE phone=$1 AND revoked_at IS NULL',[ch.destination,user.id,now]);
   if(this.smsOnly&&ch.channel==='sms')await claimPhoneOrders(tx,user.id);
   const token=randomBytes(32).toString('base64url'); const csrf=this.csrfToken(token);
   await tx.query('INSERT INTO auth_sessions(token_hash,user_id,csrf_hash,created_at,expires_at) VALUES($1,$2,$3,$4,$5)',[hash(token),user.id,hash(csrf),now,new Date(now.getTime()+7*86400_000)]);
   return {token,csrf,user:{id:user.id,role:user.role}};
  });
  if(!result) throw new DomainError('INVALID_OTP',401);
  return result;
 }
 async session(token:string|undefined) {
  if(!token||token.length>200) throw new DomainError('UNAUTHENTICATED',401);
  const user=(await this.db.pool.query(`SELECT u.id,u.role,s.csrf_hash FROM auth_sessions s JOIN users u ON u.id=s.user_id
   WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>$2 AND NOT u.disabled`,[hash(token),this.clock()])).rows[0];
  if(!user||user.role!=='customer') throw new DomainError('UNAUTHENTICATED',401);
  if(this.smsOnly&&!(await this.db.pool.query("SELECT 1 FROM user_identities WHERE user_id=$1 AND channel='sms' AND verified_at IS NOT NULL",[user.id])).rowCount)throw new DomainError('UNAUTHENTICATED',401);
  return user as {id:string;role:string;csrf_hash:string};
 }
 // A stable session-bound token can be recovered after reload without storing it in localStorage.
 csrfToken(token:string) {return mac(this.secret,`csrf:${token}`);}
 async logout(token:string) {await this.db.pool.query('UPDATE auth_sessions SET revoked_at=$2 WHERE token_hash=$1',[hash(token),this.clock()]);}
}
