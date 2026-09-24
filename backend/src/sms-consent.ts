import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {Database,lock,type Tx} from './db.js';
import {DomainError} from './core.js';
import {normalizeCustomerPhone} from './customer-phone.js';
import {SMS_CONSENT_VERSION,SMS_CONSENT_URL,SMS_CONSENT_TEXT,SMS_CONSENT_LABEL} from './sms-consent-policy.js';
export const smsConsentInput=z.object({accepted:z.literal(true),version:z.literal(SMS_CONSENT_VERSION)}).strict();
export type SmsConsentInput=z.infer<typeof smsConsentInput>;
export function consentPhone(raw:string){return z.string().regex(/^\+7\d{10}$/).parse(normalizeCustomerPhone(raw));}
// Caller holds the same identity lock as OTP request/revoke.
export async function requireSmsConsent(tx:Tx,phone:string,now:Date,input?:SmsConsentInput){
 const active=(await tx.query('SELECT id FROM sms_consents WHERE phone=$1 AND text_version=$2 AND revoked_at IS NULL',[phone,SMS_CONSENT_VERSION])).rows[0];
 if(active)return;
 if(!input)throw new DomainError('SMS_CONSENT_REQUIRED',403);
 smsConsentInput.parse(input);
 await tx.query(`INSERT INTO sms_consents(id,phone,customer_id,text_version,document_url,text_snapshot,granted_at,action)
 VALUES($1,$2,(SELECT user_id FROM user_identities WHERE channel='sms' AND destination=$2),$3,$4,$5,$6,'request_otp')`,
 [randomUUID(),phone,SMS_CONSENT_VERSION,SMS_CONSENT_URL,JSON.stringify({label:SMS_CONSENT_LABEL,paragraphs:SMS_CONSENT_TEXT}),now]);
}
export class SmsConsent {
 constructor(private db:Database){}
 async status(raw:string){const phone=consentPhone(raw);return {version:SMS_CONSENT_VERSION,active:!!(await this.db.pool.query('SELECT 1 FROM sms_consents WHERE phone=$1 AND text_version=$2 AND revoked_at IS NULL',[phone,SMS_CONSENT_VERSION])).rowCount};}
 async history(raw:string){const phone=consentPhone(raw);return {phone,items:(await this.db.pool.query('SELECT * FROM sms_consents WHERE phone=$1 ORDER BY granted_at DESC,id DESC',[phone])).rows};}
 async revoke(raw:string,actor:string,reason:string){const phone=consentPhone(raw);z.string().trim().min(1).max(500).parse(reason);
  return this.db.transaction(async tx=>{await lock(tx,`identity:sms:${phone}`);await tx.query('UPDATE sms_consents SET revoked_at=now(),revoked_by=$2,revoke_reason=$3 WHERE phone=$1 AND revoked_at IS NULL',[phone,actor,reason]);return {ok:true};});
 }
}
