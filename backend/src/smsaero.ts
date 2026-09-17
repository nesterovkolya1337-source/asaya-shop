import {z} from 'zod';
import {DomainError} from './core.js';
import type {OtpSender} from './auth.js';
import {normalizeCustomerPhone} from './customer-phone.js';

const settingsSchema=z.object({email:z.email().max(254),apiKey:z.string().min(16).max(512),sign:z.string().trim().min(1).max(100),mode:z.enum(['live','test']),timeoutMs:z.number().int().min(1000).max(15000).default(8000)}).strict();
export type SmsAeroSettings=z.input<typeof settingsSchema>;
const messageReceipt=z.object({id:z.number().int().positive().safe(),status:z.number().int(),number:z.union([z.string(),z.number().int().safe()]).optional()});
export function parseSmsAeroReceipt(raw:unknown,phone:string){
 // The API documents an array; its SDK also documents a single-message object.
 // One OTP request must produce exactly one receipt for the intended recipient.
 const parsed=z.object({success:z.literal(true),data:z.union([messageReceipt,z.array(messageReceipt).length(1)])}).parse(raw);
 const receipt=Array.isArray(parsed.data)?parsed.data[0]!:parsed.data;
 if(receipt.number!==undefined&&normalizeCustomerPhone(String(receipt.number))!==phone)throw new Error('RECIPIENT_MISMATCH');
 // 0 queued, 1 delivered, 3 handed to carrier, 4 waiting for status, 8 moderation.
 // Accepted is not delivered. Rejection (6), failed delivery (2), and unknown
 // statuses cannot unlock a challenge. Moderation never justifies sending again.
 if(![0,1,3,4,8].includes(receipt.status))throw new Error('NOT_ACCEPTED');
 return {provider:'smsaero' as const,messageId:String(receipt.id),status:String(receipt.status)};
}
export function smsAeroFromEnv(env:NodeJS.ProcessEnv){
 const enabled=z.enum(['true','false']).default('false').parse(env.CUSTOMER_SMS_ENABLED)==='true';
 const provider=z.enum(['disabled','smsaero']).default('disabled').parse(env.OTP_PROVIDER);
 if(provider==='disabled'){
  if(enabled)throw new Error('Customer SMS requires OTP_PROVIDER=smsaero');
  return {enabled:false,settings:undefined};
 }
 const settings=settingsSchema.parse({email:env.SMSAERO_EMAIL,apiKey:env.SMSAERO_API_KEY,sign:env.SMSAERO_SIGN,mode:env.SMSAERO_MODE??'test',timeoutMs:env.SMSAERO_TIMEOUT_MS?Number(env.SMSAERO_TIMEOUT_MS):undefined});
 if(env.NODE_ENV==='production'&&enabled&&settings.mode!=='live')throw new Error('Production customer login requires live SMS delivery');
 // v10.1 uses the ordinary SMS API with the sign available to this account.
 // Do not require buying a branded sender or an operator authorization template.
 return {enabled,settings};
}

// Official SMS Aero API: HTTPS POST, Basic e-mail/API key, JSON number/text/sign.
// Single attempt: a timeout/5xx may occur after acceptance; blindly retrying sends a second SMS.
export class SmsAeroSender implements OtpSender {
 #settings:z.output<typeof settingsSchema>;
 constructor(settings:SmsAeroSettings,private request:typeof fetch=fetch){this.#settings=settingsSchema.parse(settings);}
 async sendOtp(input:Parameters<OtpSender['sendOtp']>[0]){
  const phone=normalizeCustomerPhone(input.destination);
  if(input.channel!=='sms'||!phone||!/^\d{6}$/.test(input.code))throw new DomainError('SMS_INPUT_INVALID',400);
  const c=this.#settings;
  try{
   const response=await this.request(`https://gate.smsaero.ru/v2/sms/${c.mode==='test'?'testsend':'send'}`,{
    method:'POST',redirect:'error',signal:AbortSignal.timeout(c.timeoutMs),
    headers:{'Authorization':'Basic '+Buffer.from(c.email+':'+c.apiKey).toString('base64'),'Content-Type':'application/json','Accept':'application/json'},
    body:JSON.stringify({number:phone.slice(1),text:`Код для входа в личный кабинет ASAYA: ${input.code}`,sign:c.sign}),
   });
   if(!response.ok){await response.body?.cancel();throw new Error('HTTP');}
   const reader=response.body?.getReader();if(!reader)throw new Error('BODY');
   const chunks:Uint8Array[]=[];let size=0;
   try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>16384)throw new Error('BODY_LIMIT');chunks.push(part.value);}}
   finally{await reader.cancel();}
   const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));
   // Keep only a technical receipt. Provider responses may echo OTP text and phone.
   return parseSmsAeroReceipt(data,phone);
  }catch{throw new DomainError('OTP_DELIVERY_UNAVAILABLE',503);}
 }
}
