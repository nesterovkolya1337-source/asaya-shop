import {z} from 'zod';
import {DomainError} from './core.js';
import {providerJson} from './provider-json.js';
import {fulfillmentStatus} from './cdek-status.js';
const positive=z.number().int().positive().safe();
const credentials=z.object({login:z.string().min(1).max(254),password:z.string().min(1).max(512),shopId:positive,warehouseId:positive,senderId:positive,environment:z.enum(['test','production'])}).strict();
export type FulfillmentSettings=z.infer<typeof credentials>;
const id=z.string().min(1).max(100);
export const fulfillmentSnapshotSchema=z.object({externalId:id,environment:z.enum(['test','production']),payment:z.literal('paid'),customer:z.object({name:z.string().trim().min(1).max(200),phone:z.string().regex(/^\+7\d{10}$/),email:z.email().max(254).optional()}).strict(),
 delivery:z.discriminatedUnion('method',[
  z.object({method:z.literal('pickup_point'),rateId:positive,servicePointId:positive}).strict(),
  z.object({method:z.literal('courier'),rateId:positive,address:z.string().trim().min(5).max(1000)}).strict()
 ]),items:z.array(z.object({offerId:positive,quantity:positive.max(100),unitMinor:z.number().int().nonnegative().max(1_000_000_000_000)}).strict()).min(1).max(50)}).strict().refine(v=>new Set(v.items.map(x=>x.offerId)).size===v.items.length);
export type FulfillmentSnapshot=z.infer<typeof fulfillmentSnapshotSchema>;
export function fulfillmentPayload(settings:FulfillmentSettings,raw:unknown){
 const s=credentials.parse(settings),v=fulfillmentSnapshotSchema.parse(raw);
 if(s.environment!==v.environment)throw new DomainError('FULFILLMENT_ENVIRONMENT_MISMATCH');
 // Supplied account was verified read-only as a test shop. Never allow it in production.
 if(s.environment==='production'&&(s.shopId===217484||s.warehouseId===7460||s.senderId===9704))throw new DomainError('FULFILLMENT_TEST_ACCOUNT');
 return {shop:s.shopId,extId:v.externalId,paymentState:'paid' as const,profile:{name:v.customer.name,...(v.customer.email?{email:v.customer.email}:{})},phone:v.customer.phone,eav:{'order-reserve-warehouse':s.warehouseId},
 ...(v.delivery.method==='courier'?{address:{notFormal:v.delivery.address}}:{}),
 deliveryRequest:{deliveryService:1,sender:s.senderId,rate:v.delivery.rateId,retailPrice:0,...(v.delivery.method==='pickup_point'?{servicePoint:v.delivery.servicePointId}:{})},
 orderProducts:v.items.map(i=>({productOffer:i.offerId,count:i.quantity,price:i.unitMinor/100}))};
}
const orderSchema=z.object({id:positive,extId:id,state:z.string().min(1).max(100),paymentState:z.enum(['paid','not_paid']),eav:z.object({'order-reserve-warehouse':positive}),_embedded:z.object({shop:z.object({id:positive}),deliveryRequest:z.object({trackingNumber:z.string().max(100).nullable().optional()}).nullable().optional()})});
export type FulfillmentOrder={id:number;externalId:string;rawStatus:string;status:ReturnType<typeof fulfillmentStatus>;trackingNumber:string|null};
function query(field:string,value:string){return new URLSearchParams({'filter[0][type]':'eq','filter[0][field]':field,'filter[0][value]':value});}
export class CdekFulfillmentClient{
 #settings:FulfillmentSettings;
 constructor(settings:FulfillmentSettings,private transport:typeof fetch=fetch){this.#settings=credentials.parse(settings);}
 private async request(path:string,body?:unknown){
  try{return await providerJson(await this.transport('https://cdek.orderadmin.ru/api'+path,{method:body?'POST':'GET',headers:{authorization:'Basic '+Buffer.from(this.#settings.login+':'+this.#settings.password).toString('base64'),accept:'application/json',...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(8000)}));}
  catch{throw new DomainError('FULFILLMENT_UNAVAILABLE',503);}
 }
 private parse(raw:unknown,externalId?:string):FulfillmentOrder{
  const parsed=orderSchema.safeParse(raw);if(!parsed.success)throw new DomainError('FULFILLMENT_INVALID_RESPONSE',503);const o=parsed.data;
  if(o._embedded.shop.id!==this.#settings.shopId||o.eav['order-reserve-warehouse']!==this.#settings.warehouseId||o.paymentState!=='paid'||(externalId!==undefined&&o.extId!==externalId))throw new DomainError('FULFILLMENT_ORDER_MISMATCH');
  const tracking=o._embedded.deliveryRequest?.trackingNumber;
  return {id:o.id,externalId:o.extId,rawStatus:o.state,status:fulfillmentStatus(o.state),trackingNumber:tracking&&/^\d{5,30}$/.test(tracking)?tracking:null};
 }
 async find(externalId:string):Promise<FulfillmentOrder|null>{
  id.parse(externalId);const q=query('extId',externalId);
  const page=z.object({total_items:z.number().int().nonnegative(),_embedded:z.object({order:z.array(z.unknown()).max(250)})}).safeParse(await this.request('/products/order?'+q));
  if(!page.success)throw new DomainError('FULFILLMENT_INVALID_RESPONSE',503);
  if(page.data.total_items===0&&page.data._embedded.order.length===0)return null;
  // Refuse ambiguous results, even if only one of them matches our shop.
  if(page.data.total_items!==1||page.data._embedded.order.length!==1)throw new DomainError('FULFILLMENT_DUPLICATE_REVIEW');
  return this.parse(page.data._embedded.order[0],externalId);
 }
 async get(orderId:number,externalId:string){const o=this.parse(await this.request('/products/order/'+positive.parse(orderId)),id.parse(externalId));if(o.id!==orderId)throw new DomainError('FULFILLMENT_ORDER_MISMATCH');return o;}
 async create(snapshot:FulfillmentSnapshot){const body=fulfillmentPayload(this.#settings,snapshot);return this.parse(await this.request('/products/order',body),snapshot.externalId);}
 async servicePoint(code:string){
  const page=z.object({total_items:z.literal(1),_embedded:z.object({servicePoints:z.array(z.object({id:positive,extId:id})).length(1)})}).safeParse(await this.request('/delivery-services/service-points?'+query('extId',id.parse(code))));
  if(!page.success||page.data._embedded.servicePoints[0]!.extId!==code)throw new DomainError('FULFILLMENT_PICKUP_MAPPING_REQUIRED');
  return page.data._embedded.servicePoints[0]!.id;
 }
}
