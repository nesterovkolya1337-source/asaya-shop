import {z} from 'zod';
import {DomainError} from './core.js';
import {providerJson} from './provider-json.js';
import {deliveryStatus} from './cdek-status.js';
const credentials=z.object({account:z.string().min(1).max(100),clientId:z.string().min(1).max(512),clientSecret:z.string().min(1).max(512),environment:z.enum(['test','production'])}).strict();
export type CdekDeliverySettings=z.infer<typeof credentials>;
export function cdekTrackingFromEnv(env:NodeJS.ProcessEnv){
 if(z.enum(['false','true']).default('false').parse(env.CDEK_TRACKING_ENABLED)==='false')return undefined;
 const settings=credentials.parse({account:env.CDEK_API_ACCOUNT,clientId:env.CDEK_CLIENT_ID,clientSecret:env.CDEK_CLIENT_SECRET,environment:env.CDEK_ENVIRONMENT});
 const secret=z.string().regex(/^[A-Za-z0-9_-]{32,256}$/).parse(env.CDEK_WEBHOOK_SECRET);
 if(env.NODE_ENV==='production'&&settings.environment!=='production')throw new Error('CDEK test credentials cannot track production orders');
 return {settings,secret};
}
const tracking=z.string().regex(/^\d{5,30}$/);
const timestamp=z.string().max(40).refine(v=>/(Z|[+-]\d{2}:?\d{2})$/.test(v)&&Number.isFinite(Date.parse(v)));
const eventSchema=z.object({code:z.string().min(1).max(100),date_time:timestamp,deleted:z.boolean().default(false)});
const responseSchema=z.object({entity:z.object({uuid:z.uuid(),cdek_number:tracking,number:z.string().min(1).max(30).optional(),is_return:z.literal(false),is_reverse:z.literal(false),is_client_return:z.literal(false),delivery_point:z.string().min(1).max(255).optional(),planned_delivery_date:z.iso.date().optional(),statuses:z.array(eventSchema).min(1).max(500)})});
export type CdekOrderStatus={uuid:string;trackingNumber:string;clientOrderNumber?:string;pickupPoint?:string;plannedDeliveryDate?:string;events:Array<{rawStatus:string;status:ReturnType<typeof deliveryStatus>;occurredAt:string;deleted:boolean}>};
export function parseCdekOrder(raw:unknown,expected:{trackingNumber:string;uuid?:string}):CdekOrderStatus{
 const result=responseSchema.safeParse(raw);if(!result.success)throw new DomainError('CDEK_INVALID_RESPONSE',503);const o=result.data.entity;
 if(o.cdek_number!==expected.trackingNumber||(expected.uuid&&o.uuid!==expected.uuid))throw new DomainError('CDEK_ORDER_MISMATCH');
 return {uuid:o.uuid,trackingNumber:o.cdek_number,...(o.number?{clientOrderNumber:o.number}:{}),...(o.delivery_point?{pickupPoint:o.delivery_point}:{}),...(o.planned_delivery_date?{plannedDeliveryDate:o.planned_delivery_date}:{}),events:o.statuses.map(e=>({rawStatus:e.code,status:deliveryStatus(e.code),occurredAt:new Date(e.date_time).toISOString(),deleted:e.deleted})).sort((a,b)=>a.occurredAt.localeCompare(b.occurredAt))};
}
export class CdekDeliveryClient{
 #settings:CdekDeliverySettings;#token?:{value:string;expiresAt:number};#pending?:Promise<string>;
 constructor(settings:CdekDeliverySettings,private transport:typeof fetch=fetch,private clock=()=>Date.now()){this.#settings=credentials.parse(settings);}
 private get base(){return this.#settings.environment==='test'?'https://api.edu.cdek.ru':'https://api.cdek.ru';}
 private async token(){
  if(this.#token&&this.#token.expiresAt>this.clock()+60000)return this.#token.value;
  if(this.#pending)return this.#pending;
  this.#pending=(async()=>{
   // The published OAuth contract uses query parameters. URLs, tokens and bodies
   // are confined here and never interpolated into logs/errors.
   const q=new URLSearchParams({grant_type:'client_credentials',client_id:this.#settings.clientId,client_secret:this.#settings.clientSecret});
   const raw=await providerJson(await this.transport(this.base+'/v2/oauth/token?'+q,{method:'POST',redirect:'error',signal:AbortSignal.timeout(8000)}),16384);
   const value=z.object({access_token:z.string().min(1).max(8192),expires_in:z.number().int().min(1).max(86400),token_type:z.string().regex(/^bearer$/i)}).parse(raw);
   this.#token={value:value.access_token,expiresAt:this.clock()+value.expires_in*1000};return value.access_token;
  })();
  try{return await this.#pending;}catch{throw new DomainError('CDEK_UNAVAILABLE',503);}finally{this.#pending=undefined;}
 }
 private async get(path:string){
  try{return await providerJson(await this.transport(this.base+path,{headers:{authorization:'Bearer '+await this.token(),accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(8000)}));}
  catch{throw new DomainError('CDEK_UNAVAILABLE',503);}
 }
 async order(expected:{trackingNumber:string;uuid?:string}){
  tracking.parse(expected.trackingNumber);if(expected.uuid)z.uuid().parse(expected.uuid);
  return parseCdekOrder(await this.get(expected.uuid?'/v2/orders/'+expected.uuid:'/v2/orders?'+new URLSearchParams({cdek_number:expected.trackingNumber})),expected);
 }
 async subscriptions(){return z.array(z.object({uuid:z.uuid(),type:z.string().max(100),url:z.url().max(2048)})).max(100).parse(await this.get('/v2/webhooks'));}
 async createOrderStatusSubscription(callback:string){
  const url=new URL(z.url().max(2048).parse(callback));
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw new DomainError('CDEK_CALLBACK_INVALID',400);
  try{
   const raw=await providerJson(await this.transport(this.base+'/v2/webhooks',{
    method:'POST',headers:{authorization:'Bearer '+await this.token(),accept:'application/json','content-type':'application/json'},
    body:JSON.stringify({type:'ORDER_STATUS',url:url.href}),redirect:'error',signal:AbortSignal.timeout(8000),
   }));
   // A UUID only proves acceptance. The setup command confirms the active list.
   return z.object({entity:z.object({uuid:z.uuid()})}).parse(raw).entity;
  }catch{throw new DomainError('CDEK_SUBSCRIPTION_UNCERTAIN',503);}
 }
}
// Webhook is only a durable refresh hint. No signature is documented by CDEK;
// customer-visible state must come from the authenticated GET above.
export const cdekWebhookSchema=z.object({type:z.literal('ORDER_STATUS'),date_time:timestamp,uuid:z.uuid(),attributes:z.object({number:z.string().min(1).max(30).optional(),cdek_number:tracking,code:z.string().min(1).max(100),status_date_time:timestamp,deleted:z.boolean().default(false),is_return:z.boolean(),is_reverse:z.boolean(),is_client_return:z.boolean()})});
