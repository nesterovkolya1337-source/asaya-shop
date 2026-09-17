export type AuthChannel = 'email' | 'sms';
export type ServerSession = {user:{id:string;role:'customer'};csrfToken:string};
export type OtpChallenge = {challengeId:string;expiresInSeconds:number;retryAfterSeconds:number};
export type CustomerProfile={name:string;email:string;phone:string};
export function parseCustomerProfile(raw:unknown):CustomerProfile{
 const r=object(raw);if(typeof r.name!=='string'||r.name.length>200||typeof r.email!=='string'||r.email.length>254||typeof r.phone!=='string'||!/^\+7\d{10}$/.test(r.phone))throw new AuthClientError('INVALID_RESPONSE');
 return {name:r.name,email:r.email,phone:r.phone};
}

const messages:Record<string,string>={
 YANDEX_LOGIN_UNAVAILABLE:'Вход через Яндекс пока недоступен. Попробуйте позже.',
 ORDER_NOT_READY_FOR_COMPLETION:'Завершить можно только оплаченный и отгруженный заказ. Обновите список.',
 COMPLETION_CONFLICT:'Заказ уже завершён с другим основанием. Обновите карточку для проверки.',
 ORDER_NOT_READY_FOR_DISPATCH:'Отгрузка доступна для заказа в сборке с подтверждённой оплатой или оплатой при получении через Яндекс. Обновите список.',
 ORDER_NOT_PACKED:'Сначала подтвердите комплектацию всех товаров.',
 DISPATCH_CONFLICT:'Отгрузка уже оформлена с другими данными или требует проверки. Обновите заказ.',
 ORDER_NOT_READY_FOR_PACKING:'Комплектация доступна для заказа в сборке с подтверждённой оплатой или оплатой при получении через Яндекс. Обновите список.',
 PACKING_ITEMS_MISMATCH:'Проверьте все позиции и количество товаров. Комплектация не совпадает с заказом.',
 ORDER_NOT_READY_FOR_PROCESSING:'Для сборки нужен подтверждённый заказ с оплатой или оплатой при получении через Яндекс. Обновите список заказов.',
 ORDER_RESERVATION_MISSING:'Резерв товаров не соответствует заказу. Действие не выполнено — требуется проверить остатки и резерв.',
 OTP_DELIVERY_UNAVAILABLE:'Отправка кодов пока недоступна. Попробуйте позже.',
 OTP_COOLDOWN:'Код можно запросить раз в минуту. Немного подождите.',
 RATE_LIMITED:'Слишком много попыток. Попробуйте позже.',
 INVALID_OTP:'Код неверный, истёк или уже использован. Проверьте его или запросите новый.',
 INVALID_INPUT:'Проверьте заполнение полей и формат введённых данных.',
 UNAUTHENTICATED:'Сессия завершилась. Войдите снова.',
 CSRF_REJECTED:'Обновите состояние входа и повторите действие.',
 ORIGIN_REJECTED:'Вход временно недоступен. Попробуйте позже.',
 INVALID_RESPONSE:'Не удалось подтвердить ответ сервера. Повторите попытку.',
 NETWORK_ERROR:'Нет ответа от сервера. Проверьте соединение и повторите попытку.',
 REQUEST_FAILED:'Не удалось выполнить действие. Попробуйте позже.',
 ORDER_NOT_FOUND:'Заказ не найден или недоступен для этого аккаунта.',
 INVALID_ORDER_CURSOR:'Список заказов изменился. Обновите его.',
 CANCELLATION_REQUIRES_REVIEW:'Самостоятельная отмена этого заказа недоступна. Обратитесь в службу заботы.'
 ,DELIVERY_UNAVAILABLE:'Расчёт доставки пока недоступен. Заказ не создан.'
 ,PRODUCT_UNAVAILABLE:'Один из товаров больше недоступен. Обновите каталог и корзину.'
 ,INSUFFICIENT_STOCK:'Товаров уже недостаточно. Обновите корзину.'
 ,PRICE_CHANGED:'Цена изменилась. Обновите каталог и пересчитайте заказ.'
 ,INVALID_DELIVERY_QUOTE:'Расчёт доставки устарел или не соответствует корзине. Рассчитайте заново.'
 ,IDEMPOTENCY_CONFLICT:'Эта попытка уже связана с другим составом заказа. Проверьте результат.'
};
export class AuthClientError extends Error {
 readonly code:string;
 constructor(code:string){super(messages[code]??messages.REQUEST_FAILED);this.code=code;}
}
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
function object(raw:unknown):Record<string,unknown> {
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new AuthClientError('INVALID_RESPONSE');
 return raw as Record<string,unknown>;
}
export function parseSession(raw:unknown):ServerSession {
 const data=object(raw);const user=object(data.user);
 if(typeof user.id!=='string'||!uuid.test(user.id)||user.role!=='customer'||typeof data.csrfToken!=='string'||!/^[a-f0-9]{64}$/.test(data.csrfToken))
  throw new AuthClientError('INVALID_RESPONSE');
 return {user:{id:user.id,role:'customer'},csrfToken:data.csrfToken};
}
export function createStoreRequest(base:string,fetcher:typeof fetch) {
 return async function request(path:string,method:'GET'|'POST'|'PUT',body?:unknown,csrf?:string,idempotencyKey?:string,timeoutMs=8000):Promise<unknown> {
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),timeoutMs);
  try {
   const response=await fetcher(`${base}/${path}`,{method,credentials:'same-origin',cache:'no-store',signal:controller.signal,
    headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),...(csrf?{'X-CSRF-Token':csrf}:{}),...(idempotencyKey?{'Idempotency-Key':idempotencyKey}:{})},
    ...(body!==undefined?{body:JSON.stringify(body)}:{})});
   const payload:unknown=await response.json().catch(()=>null);
   if(!response.ok) {
    const code=payload&&typeof payload==='object'&&'error' in payload&&typeof payload.error==='string'?payload.error:'REQUEST_FAILED';
    throw new AuthClientError(code);
   }
   return payload;
  } catch(error) {if(error instanceof AuthClientError)throw error;throw new AuthClientError('NETWORK_ERROR');}
  finally {clearTimeout(timeout);}
 }
}
export function createAuthClient(base:string,fetcher:typeof fetch=fetch) {
 const storeRequest=createStoreRequest(base,fetcher);
 const request=(path:string,method:'GET'|'POST',body?:unknown,csrf?:string)=>storeRequest(`auth/${path}`,method,body,csrf);
 return {
  async profile(){return parseCustomerProfile(await storeRequest('account/profile','GET'));},
  async saveProfile(profile:Pick<CustomerProfile,'name'|'email'>,csrf:string){return parseCustomerProfile(await storeRequest('account/profile','PUT',profile,csrf));},
  async methods():Promise<{yandex:boolean;orders:boolean;sms?:boolean}> {
   const data=object(await request('methods','GET'));
   if(typeof data.yandex!=='boolean'||typeof data.orders!=='boolean')throw new AuthClientError('INVALID_RESPONSE');
   if(data.sms!==undefined&&typeof data.sms!=='boolean')throw new AuthClientError('INVALID_RESPONSE');
   return {yandex:data.yandex,orders:data.orders,...(data.sms===undefined?{}:{sms:data.sms})};
  },
  async startYandex():Promise<string> {
   const data=object(await request('yandex/start','POST',{}));
   if(typeof data.url!=='string')throw new AuthClientError('INVALID_RESPONSE');
   let url:URL;
   try{url=new URL(data.url);}catch{throw new AuthClientError('INVALID_RESPONSE');}
   if(url.origin!=='https://oauth.yandex.ru'||url.pathname!=='/authorize'||url.username||url.password||url.hash||
    url.searchParams.get('response_type')!=='code'||url.searchParams.get('code_challenge_method')!=='S256'||
    !/^[A-Za-z0-9_-]{43}$/.test(url.searchParams.get('state')??'')||
    !/^[A-Za-z0-9_-]{43}$/.test(url.searchParams.get('code_challenge')??''))throw new AuthClientError('INVALID_RESPONSE');
   return url.href;
  },
  async me():Promise<ServerSession|null> {
   try {const data=object(await request('me','GET'));return parseSession({user:{id:data.id,role:data.role},csrfToken:data.csrfToken});}
   catch(error){if(error instanceof AuthClientError&&error.code==='UNAUTHENTICATED')return null;throw error;}
  },
  async sendCode(channel:AuthChannel,destination:string):Promise<OtpChallenge> {
   const data=object(await request('otp/request','POST',{channel,destination:destination.trim()}));
   if(typeof data.challengeId!=='string'||!uuid.test(data.challengeId)||
    !Number.isInteger(data.expiresInSeconds)||Number(data.expiresInSeconds)<=0||Number(data.expiresInSeconds)>3600||
    !Number.isInteger(data.retryAfterSeconds)||Number(data.retryAfterSeconds)<1||Number(data.retryAfterSeconds)>3600)
    throw new AuthClientError('INVALID_RESPONSE');
   return {challengeId:data.challengeId,expiresInSeconds:Number(data.expiresInSeconds),retryAfterSeconds:Number(data.retryAfterSeconds)};
  },
  async verify(challengeId:string,code:string):Promise<ServerSession> {
   if(!/^\d{6}$/.test(code))throw new AuthClientError('INVALID_INPUT');
   return parseSession(await request('otp/verify','POST',{challengeId,code}));
  },
  async logout(session:ServerSession):Promise<void> {
   try {const data=object(await request('logout','POST',{},session.csrfToken));if(data.ok!==true)throw new AuthClientError('INVALID_RESPONSE');}
   catch(error){if(error instanceof AuthClientError&&error.code==='UNAUTHENTICATED')return;throw error;}
  }
 };
}

export type CartLine={sku:string;quantity:number};
export type DeliveryQuote={deliveryQuoteId:string;amountMinor:number;currency:'RUB';label:string;expiresAt:string};
export type CheckoutBody={items:CartLine[];deliveryQuoteId:string;customer:{name:string;phone:string};consent:{offerVersion:'test-v1';privacyVersion:'test-v1';marketing:false};expectedTotalMinor:number};
export type CheckoutResult={orderId:string;checkoutId:string;publicNumber:string;totalMinor:number};
export function parseCheckoutResult(raw:unknown):CheckoutResult {
 const r=object(raw);
 if(typeof r.orderId!=='string'||!uuid.test(r.orderId)||typeof r.checkoutId!=='string'||!uuid.test(r.checkoutId)||typeof r.publicNumber!=='string'||!/^ASAYA-\d+$/.test(r.publicNumber)||!validAmount(r.totalMinor))throw new AuthClientError('INVALID_RESPONSE');
 return {orderId:r.orderId,checkoutId:r.checkoutId,publicNumber:r.publicNumber,totalMinor:r.totalMinor};
}
export function createCheckoutClient(base:string,fetcher:typeof fetch=fetch) {
 const request=createStoreRequest(base,fetcher);
 return {
  async quote(items:CartLine[],address:{city:string;address:string},csrf:string):Promise<DeliveryQuote> {
   const r=object(await request('delivery/quotes','POST',{items,address},csrf));
   if(typeof r.deliveryQuoteId!=='string'||!uuid.test(r.deliveryQuoteId)||!validAmount(r.amountMinor)||r.currency!=='RUB'||typeof r.label!=='string'||!r.label||typeof r.expiresAt!=='string'||!Number.isFinite(Date.parse(r.expiresAt)))throw new AuthClientError('INVALID_RESPONSE');
   return {deliveryQuoteId:r.deliveryQuoteId,amountMinor:r.amountMinor,currency:'RUB',label:r.label,expiresAt:r.expiresAt};
  },
  async create(body:CheckoutBody,key:string,csrf:string):Promise<CheckoutResult>{return parseCheckoutResult(await request('checkouts','POST',body,csrf,key));},
  async recover(key:string):Promise<CheckoutResult|null>{
   if(!/^[A-Za-z0-9_-]{16,128}$/.test(key))throw new AuthClientError('INVALID_INPUT');
   try{return parseCheckoutResult(await request(`checkouts/by-key/${encodeURIComponent(key)}`,'GET'));}
   catch(error){if(error instanceof AuthClientError&&error.code==='CHECKOUT_NOT_FOUND')return null;throw error;}
  }
 };
}

export type OrderSummary={id:string;public_number:string;status:string;payment_status:string;delivery_status:string;currency:'RUB';total_minor:number;created_at:string;customer_status?:string};
export type OrderTracking={status:string;label:string;trackingNumber:string|null;updatedAt:string|null;lastStatusAt?:string|null;pickupPoint?:string|null;plannedDeliveryDate?:string|null;history:Array<{status:string;label:string;occurredAt:string}>};
export type OrderDetail=OrderSummary & {tracking?:OrderTracking;delivery?:{label:string;city:string;address:string;pickupPoint?:string;plannedStart?:string;plannedEnd?:string};statusHistory?:Array<{kind:string;status:string;occurred_at:string}>;shipment:null|{carrier:string;trackingNumber:string};subtotal_minor:number;delivery_minor:number;canCancel:boolean;items:Array<{sku:string;name_snapshot:string;quantity:number;unit_minor:number;line_minor:number}>};
function calendarDate(value:unknown):value is string{return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;}
export const trackingLabels:Record<string,string>={pending_payment:'Ожидает оплаты',paid:'Оплачен',processing:'Собираем заказ',handed_to_delivery:'Передан в СДЭК',in_transit:'В пути',ready_for_pickup:'Готов к выдаче',delivered:'Получен',cancelled:'Отменён',returning:'Возвращается отправителю',returned:'Возвращён отправителю',refunded:'Деньги возвращены',delivery_problem:'Нужна дополнительная проверка доставки',assembling:'Собираем заказ',handed_to_cdek:'Передан в СДЭК',out_for_delivery:'В пути',review:'Нужна дополнительная проверка доставки'};
function parseTracking(raw:unknown):OrderTracking{
 const t=object(raw),date=(v:unknown):v is string=>typeof v==='string'&&Number.isFinite(Date.parse(v));
 if(typeof t.status!=='string'||!Object.hasOwn(trackingLabels,t.status)||!(t.trackingNumber===null||typeof t.trackingNumber==='string'&&/^\d{5,30}$/.test(t.trackingNumber))||!(t.updatedAt===null||date(t.updatedAt))||!Array.isArray(t.history)||t.history.length>500)throw new AuthClientError('INVALID_RESPONSE');
 if(t.lastStatusAt!=null&&!date(t.lastStatusAt)||t.pickupPoint!=null&&(typeof t.pickupPoint!=='string'||!t.pickupPoint.length||t.pickupPoint.length>255)||t.plannedDeliveryDate!=null&&!calendarDate(t.plannedDeliveryDate))throw new AuthClientError('INVALID_RESPONSE');
 return {status:t.status,label:trackingLabels[t.status],trackingNumber:t.trackingNumber as string|null,updatedAt:t.updatedAt as string|null,lastStatusAt:t.lastStatusAt as string|null??null,pickupPoint:t.pickupPoint as string|null??null,plannedDeliveryDate:t.plannedDeliveryDate as string|null??null,history:t.history.map(raw=>{const e=object(raw);if(typeof e.status!=='string'||!Object.hasOwn(trackingLabels,e.status)||!date(e.occurredAt))throw new AuthClientError('INVALID_RESPONSE');return {status:e.status,label:trackingLabels[e.status],occurredAt:e.occurredAt};})};
}
export const orderLabels:Record<string,string>={draft:'Ожидает оформления',placed:'Оформлен',processing:'В обработке',completed:'Завершён',cancelled:'Отменён'};
export const paymentLabels:Record<string,string>={pending:'Ожидает оплаты',authorized:'Средства заблокированы',paid:'Оплачен',failed:'Оплата не прошла',cancelled:'Оплата отменена',partially_refunded:'Частичный возврат',refunded:'Возврат выполнен'};
export const deliveryLabels:Record<string,string>={not_created:'Доставка ещё не оформлена',preparing:'Готовится к отправке',shipped:'В пути',arrived_to_pickup_point:'В пункте выдачи',delivered:'Доставлен',cancelled:'Доставка отменена',returned:'Возвращён'};
const validAmount=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0&&value<=1_000_000_000_000;
export function parseOrderSummary(raw:unknown):OrderSummary {
 const row=object(raw);
 if(typeof row.id!=='string'||!uuid.test(row.id)||typeof row.public_number!=='string'||!/^ASAYA-\d+$/.test(row.public_number)||
  typeof row.status!=='string'||!Object.hasOwn(orderLabels,row.status)||typeof row.payment_status!=='string'||!Object.hasOwn(paymentLabels,row.payment_status)||
  typeof row.delivery_status!=='string'||!Object.hasOwn(deliveryLabels,row.delivery_status)||row.currency!=='RUB'||!validAmount(row.total_minor)||
  typeof row.created_at!=='string'||!Number.isFinite(Date.parse(row.created_at)))throw new AuthClientError('INVALID_RESPONSE');
 if(row.customer_status!==undefined&&(typeof row.customer_status!=='string'||!Object.hasOwn(trackingLabels,row.customer_status)))throw new AuthClientError('INVALID_RESPONSE');
 return {id:row.id,public_number:row.public_number,status:row.status,payment_status:row.payment_status,delivery_status:row.delivery_status,...(row.customer_status?{customer_status:String(row.customer_status)}:{}),
  currency:'RUB',total_minor:row.total_minor,created_at:row.created_at};
}
export function parseOrderDetail(raw:unknown):OrderDetail {
 const summary=parseOrderSummary(raw);const row=object(raw);
 if(!validAmount(row.subtotal_minor)||!validAmount(row.delivery_minor)||row.subtotal_minor+row.delivery_minor!==summary.total_minor||
  typeof row.canCancel!=='boolean'||row.canCancel&&!(summary.status==='draft'&&['pending','failed'].includes(summary.payment_status))||
  !Array.isArray(row.items)||row.items.length<1||row.items.length>50)throw new AuthClientError('INVALID_RESPONSE');
 let shipment:OrderDetail['shipment']=null;
 if(row.shipment!==null){
  const s=object(row.shipment);
  if(typeof s.carrier!=='string'||!s.carrier.trim()||s.carrier.length>100||typeof s.trackingNumber!=='string'||!s.trackingNumber.trim()||s.trackingNumber.length>100)throw new AuthClientError('INVALID_RESPONSE');
  shipment={carrier:s.carrier,trackingNumber:s.trackingNumber};
 }
 const seen=new Set<string>();
 const items=row.items.map(rawItem=>{
  const item=object(rawItem);
  if(typeof item.sku!=='string'||!item.sku||seen.has(item.sku)||typeof item.name_snapshot!=='string'||!item.name_snapshot||
   typeof item.quantity!=='number'||!Number.isInteger(item.quantity)||item.quantity<1||item.quantity>100||!validAmount(item.unit_minor)||
   !validAmount(item.line_minor)||item.unit_minor*item.quantity!==item.line_minor)throw new AuthClientError('INVALID_RESPONSE');
  seen.add(item.sku);return {sku:item.sku,name_snapshot:item.name_snapshot,quantity:item.quantity,unit_minor:item.unit_minor,line_minor:item.line_minor};
 });
 if(items.reduce((sum,item)=>sum+item.line_minor,0)!==row.subtotal_minor)throw new AuthClientError('INVALID_RESPONSE');
 let delivery:OrderDetail['delivery'],history:OrderDetail['statusHistory'];
 if(row.delivery!==undefined){
  const d=object(row.delivery);if(!['label','city','address'].every(k=>typeof d[k]==='string'&&d[k].length<=5000)||d.pickupPoint!==undefined&&(typeof d.pickupPoint!=='string'||!d.pickupPoint.length||d.pickupPoint.length>200))throw new AuthClientError('INVALID_RESPONSE');
  if((d.plannedStart!==undefined||d.plannedEnd!==undefined)&&(!calendarDate(d.plannedStart)||!calendarDate(d.plannedEnd)||d.plannedStart>d.plannedEnd))throw new AuthClientError('INVALID_RESPONSE');
  delivery={label:String(d.label),city:String(d.city),address:String(d.address),...(d.pickupPoint?{pickupPoint:String(d.pickupPoint)}:{}),...(d.plannedStart?{plannedStart:String(d.plannedStart),plannedEnd:String(d.plannedEnd)}:{})};
 }
 if(row.statusHistory!==undefined){if(!Array.isArray(row.statusHistory)||row.statusHistory.length>10000)throw new AuthClientError('INVALID_RESPONSE');history=row.statusHistory.map(raw=>{const h=object(raw);if(typeof h.kind!=='string'||typeof h.status!=='string'||typeof h.occurred_at!=='string'||!Number.isFinite(Date.parse(h.occurred_at)))throw new AuthClientError('INVALID_RESPONSE');return {kind:h.kind,status:h.status,occurred_at:h.occurred_at};});}
 return {...summary,shipment,...(row.tracking?{tracking:parseTracking(row.tracking)}:{}),...(delivery?{delivery}:{}),...(history?{statusHistory:history}:{}),subtotal_minor:row.subtotal_minor,delivery_minor:row.delivery_minor,canCancel:row.canCancel,items};
}
export function createOrdersClient(base:string,fetcher:typeof fetch=fetch) {
 const request=createStoreRequest(base,fetcher);
 const path=(id:string)=>{if(!uuid.test(id))throw new AuthClientError('INVALID_INPUT');return `orders/${id}`;};
 return {
  async list(cursor?:string):Promise<{items:OrderSummary[];nextCursor:string|null}> {
   if(cursor&&!uuid.test(cursor))throw new AuthClientError('INVALID_INPUT');
   const row=object(await request(`orders${cursor?`?cursor=${encodeURIComponent(cursor)}`:''}`,'GET'));
   if(!Array.isArray(row.items)||row.items.length>20||(row.nextCursor!==null&&(typeof row.nextCursor!=='string'||!uuid.test(row.nextCursor))))throw new AuthClientError('INVALID_RESPONSE');
   const items=row.items.map(parseOrderSummary);
   if(new Set(items.map(item=>item.id)).size!==items.length||row.nextCursor===cursor||
    (row.nextCursor!==null&&items.at(-1)?.id!==row.nextCursor))throw new AuthClientError('INVALID_RESPONSE');
   return {items,nextCursor:row.nextCursor as string|null};
  },
  async detail(id:string):Promise<OrderDetail> {
   const order=parseOrderDetail(await request(path(id),'GET'));
   if(order.id!==id)throw new AuthClientError('INVALID_RESPONSE');return order;
  },
  async cancel(id:string,csrfToken:string):Promise<void> {
   const row=object(await request(`${path(id)}/cancel`,'POST',{},csrfToken));
   if(row.ok!==true)throw new AuthClientError('INVALID_RESPONSE');
  }
 };
}
