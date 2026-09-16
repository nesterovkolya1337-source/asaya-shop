import {AuthClientError,createStoreRequest,parseOrderDetail,parseOrderSummary,type OrderDetail} from './auth-client.ts';
export type AdminOrder=OrderDetail & {fulfillment?:{state:string;orderId:string|null;externalKey:string;rawStatus:string|null;updatedAt:string|null;cdekUuid:string|null;trackingNumber:string|null}|null;paymentOnDelivery:boolean;reviewSignals:Array<{kind:string;createdAt:string}>;completion:null|{completedBy:string;completedAt:string;reason:string};dispatch:null|{carrier:string;trackingNumber:string;dispatchedBy:string;dispatchedAt:string};packing:null|{packedBy:string;packedAt:string};customer:{name:string;phone:string};delivery:{label:string;city:string;address:string};history:Array<{action:string;actorId:string|null;reason:string;createdAt:string}>};
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
export const reviewSignalLabels:Record<string,string>={
 'fulfillment.cancel_review':'Запрошена отмена после передачи в фулфилмент. Сначала подтвердите остановку сборки или физический возврат; резерв сохранён.',
 'ycp.payment_reconcile_required':'Нет окончательного ответа об оплате. Требуется сверка с Яндексом; резерв сохранён.',
 'payment.late_review':'Оплата поступила после отмены заказа. Проверьте платёж и необходимость возврата.',
 'ycp.placement_after_cancel':'Яндекс подтвердил заказ после его отмены. Сверьте заказ и оплату в кабинете Яндекса.',
 'payment.refund_review':'Требуется сверить возврат денег по отмене или отказу от товаров.',
 'payment.void_review':'Требуется проверить снятие блокировки средств по отменённому заказу.',
 'ycp.return_review':'Есть отказ от товаров или отмена после отгрузки. Проверьте физический возврат на склад.',
 'ycp.cod_payment_review':'Заказ с оплатой при получении доставлен. Сверьте фактическое поступление денег.'
};
const object=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v))throw new AuthClientError('INVALID_RESPONSE');return v as Record<string,unknown>;};
export function parseAdminOrder(raw:unknown):AdminOrder{
 const order=parseOrderDetail(raw),r=object(raw),customer=object(r.customer),delivery=object(r.delivery);
 const paymentOnDelivery=r.paymentOnDelivery??false;
 if(typeof paymentOnDelivery!=='boolean'||paymentOnDelivery&&order.payment_status!=='pending')throw new AuthClientError('INVALID_RESPONSE');
 const rawSignals=r.reviewSignals??[];
 if(!Array.isArray(rawSignals)||rawSignals.length>Object.keys(reviewSignalLabels).length)throw new AuthClientError('INVALID_RESPONSE');
 const reviewSignals=rawSignals.map(v=>{const s=object(v);if(typeof s.kind!=='string'||!Object.hasOwn(reviewSignalLabels,s.kind)||typeof s.createdAt!=='string'||!Number.isFinite(Date.parse(s.createdAt)))throw new AuthClientError('INVALID_RESPONSE');return {kind:s.kind,createdAt:s.createdAt};});
 if(new Set(reviewSignals.map(s=>s.kind)).size!==reviewSignals.length)throw new AuthClientError('INVALID_RESPONSE');
 let completion:AdminOrder['completion']=null;
 if(r.completion!==null){const c=object(r.completion);if(typeof c.completedBy!=='string'||!uuid.test(c.completedBy)||typeof c.completedAt!=='string'||!Number.isFinite(Date.parse(c.completedAt))||typeof c.reason!=='string'||c.reason.trim().length<3||c.reason.length>1000)throw new AuthClientError('INVALID_RESPONSE');completion={completedBy:c.completedBy,completedAt:c.completedAt,reason:c.reason};}
 let dispatch:AdminOrder['dispatch']=null;
 if(r.dispatch!==null){const d=object(r.dispatch);if(typeof d.carrier!=='string'||!d.carrier.trim()||d.carrier.length>100||typeof d.trackingNumber!=='string'||!d.trackingNumber.trim()||d.trackingNumber.length>100||typeof d.dispatchedBy!=='string'||!uuid.test(d.dispatchedBy)||typeof d.dispatchedAt!=='string'||!Number.isFinite(Date.parse(d.dispatchedAt)))throw new AuthClientError('INVALID_RESPONSE');dispatch={carrier:d.carrier,trackingNumber:d.trackingNumber,dispatchedBy:d.dispatchedBy,dispatchedAt:d.dispatchedAt};}
 let packing:AdminOrder['packing']=null;
 if(r.packing!==null){
  const p=object(r.packing);
  if(typeof p.packedBy!=='string'||!uuid.test(p.packedBy)||typeof p.packedAt!=='string'||!Number.isFinite(Date.parse(p.packedAt)))throw new AuthClientError('INVALID_RESPONSE');
  packing={packedBy:p.packedBy,packedAt:p.packedAt};
 }
 if(![customer.name,customer.phone,delivery.label,delivery.city,delivery.address].every(v=>typeof v==='string')||!Array.isArray(r.history)||r.history.length>50)throw new AuthClientError('INVALID_RESPONSE');
 const history=r.history.map(v=>{const h=object(v);if(typeof h.action!=='string'||typeof h.reason!=='string'||!(h.actorId===null||typeof h.actorId==='string'&&uuid.test(h.actorId))||typeof h.createdAt!=='string'||!Number.isFinite(Date.parse(h.createdAt)))throw new AuthClientError('INVALID_RESPONSE');return h as AdminOrder['history'][number];});
 let fulfillment:AdminOrder['fulfillment']=null;
 if(r.fulfillment){const f=object(r.fulfillment);if(typeof f.state!=='string'||!['prepared','sending','uncertain','created','review'].includes(f.state)||typeof f.externalKey!=='string'||f.externalKey.length>100||!['orderId','rawStatus','cdekUuid','trackingNumber'].every(k=>f[k]===null||typeof f[k]==='string'&&String(f[k]).length<=100)||!(f.updatedAt===null||typeof f.updatedAt==='string'&&Number.isFinite(Date.parse(f.updatedAt))))throw new AuthClientError('INVALID_RESPONSE');fulfillment=f as NonNullable<AdminOrder['fulfillment']>;}
 return {...order,fulfillment,paymentOnDelivery,reviewSignals,completion,dispatch,packing,customer:customer as AdminOrder['customer'],delivery:delivery as AdminOrder['delivery'],history};
}
export function createAdminOrdersClient(base:string,fetcher:typeof fetch=fetch){
 const request=createStoreRequest(base,fetcher);
 const path=(id:string)=>{if(!uuid.test(id))throw new AuthClientError('INVALID_INPUT');return 'orders/'+id;};
 return {
  async list(search='',status='',cursor?:string,filters:{payment?:string;delivery?:string}={}){
   const params=new URLSearchParams({search,status,payment:filters.payment??'',delivery:filters.delivery??''});if(cursor)params.set('cursor',cursor);
   const r=object(await request('orders?'+params,'GET'));
   if(!Array.isArray(r.items)||r.items.length>20||!(r.nextCursor===null||typeof r.nextCursor==='string'&&uuid.test(r.nextCursor)))throw new AuthClientError('INVALID_RESPONSE');
   const items=r.items.map(parseOrderSummary);
   if(new Set(items.map(i=>i.id)).size!==items.length||r.nextCursor===cursor||r.nextCursor!==null&&items.at(-1)?.id!==r.nextCursor)throw new AuthClientError('INVALID_RESPONSE');
   return {items,nextCursor:r.nextCursor as string|null};
  },
  async detail(id:string){const order=parseAdminOrder(await request(path(id),'GET'));if(order.id!==id)throw new AuthClientError('INVALID_RESPONSE');return order;},
  async recheckFulfillment(id:string,csrf:string){const r=object(await request(path(id)+'/fulfillment/recheck','POST',{},csrf));if(!['review','created'].includes(String(r.state)))throw new AuthClientError('INVALID_RESPONSE');return r.state;},
  async complete(id:string,input:{reason:string;confirmed:true},csrf:string){const r=object(await request(path(id)+'/complete','POST',input,csrf));if(r.ok!==true)throw new AuthClientError('INVALID_RESPONSE');},
  async dispatch(id:string,input:{carrier:string;trackingNumber:string;confirmed:true},csrf:string){const r=object(await request(path(id)+'/dispatch','POST',input,csrf));if(r.ok!==true)throw new AuthClientError('INVALID_RESPONSE');},
  async cancel(id:string,reason:string,csrf:string){const r=object(await request(path(id)+'/cancel','POST',{reason},csrf));if(r.ok!==true)throw new AuthClientError('INVALID_RESPONSE');},
  async startProcessing(id:string,csrf:string){const r=object(await request(path(id)+'/start-processing','POST',{},csrf));if(r.ok!==true)throw new AuthClientError('INVALID_RESPONSE');},
  async completePacking(id:string,items:Array<{sku:string;quantity:number}>,csrf:string){const r=object(await request(path(id)+'/complete-packing','POST',{items},csrf));if(r.ok!==true)throw new AuthClientError('INVALID_RESPONSE');}
 };
}
