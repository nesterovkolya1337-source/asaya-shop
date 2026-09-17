// CDEK's published OpenAPI: "Приложение 1. Статусы заказов", retrieved 2026-09-15.
// FF states describe warehouse processing; only delivery API confirms physical receipt.
export type FulfillmentStatus='queued'|'accepted'|'assembling'|'assembled'|'handed_to_delivery'|'cancelled'|'returning'|'review';
export type DeliveryStatus='created'|'handed_to_cdek'|'in_transit'|'out_for_delivery'|'ready_for_pickup'|'delivered'|'cancelled'|'returning'|'returned'|'review';
const ff:Record<string,FulfillmentStatus>={pending_queued:'queued',pending_error:'review',pending:'accepted',partly_reserved:'review',confirmed:'accepted',assembling:'assembling',assembled:'assembled',delivery:'handed_to_delivery',processing:'handed_to_delivery',complete:'handed_to_delivery',cancel:'cancelled',return:'returning',partly_return:'returning'};
export function fulfillmentStatus(code:string):FulfillmentStatus{return ff[code]??'review';}
const cdek:Record<string,DeliveryStatus>={ACCEPTED:'created',CREATED:'created',REMOVED:'cancelled',INVALID:'review',RECEIVED_AT_SHIPMENT_WAREHOUSE:'handed_to_cdek',DELIVERED:'delivered',POSTOMAT_RECEIVED:'delivered',NOT_DELIVERED:'returning',POSTOMAT_SEIZED:'returning',TAKEN_BY_COURIER:'out_for_delivery',ACCEPTED_AT_PICK_UP_POINT:'ready_for_pickup',POSTOMAT_POSTED:'ready_for_pickup'};
for(const code of ['READY_FOR_SHIPMENT_IN_SENDER_CITY','TAKEN_BY_TRANSPORTER_FROM_SENDER_CITY','SENT_TO_RECIPIENT_CITY','ACCEPTED_IN_RECIPIENT_CITY','ACCEPTED_AT_RECIPIENT_CITY_WAREHOUSE','ACCEPTED_AT_TRANSIT_WAREHOUSE','RETURNED_TO_SENDER_CITY_WAREHOUSE','RETURNED_TO_TRANSIT_WAREHOUSE','RETURNED_TO_RECIPIENT_CITY_WAREHOUSE','READY_FOR_SHIPMENT_IN_TRANSIT_CITY','TAKEN_BY_TRANSPORTER_FROM_TRANSIT_CITY','SENT_TO_TRANSIT_CITY','ACCEPTED_IN_TRANSIT_CITY','SENT_TO_SENDER_CITY','ACCEPTED_IN_SENDER_CITY','ENTERED_TO_TRANSIT_WAREHOUSE','ENTERED_TO_RECIPIENT_CITY_WAREHOUSE','ENTERED_TO_PICK_UP_POINT','IN_CUSTOMS_INTERNATIONAL','SHIPPED_TO_DESTINATION','PASSED_TO_TRANSIT_CARRIER','IN_CUSTOMS_LOCAL','CUSTOMS_COMPLETE'])cdek[code]='in_transit';
export function deliveryStatus(code:string):DeliveryStatus{return cdek[code]??'review';}
export const customerStatusLabels={pending_payment:'Ожидает оплаты',paid:'Оплачен',processing:'Собираем заказ',handed_to_delivery:'Передан в СДЭК',in_transit:'В пути',ready_for_pickup:'Готов к выдаче',delivered:'Получен',cancelled:'Отменён',returning:'Возвращается отправителю',returned:'Возвращён отправителю',refunded:'Деньги возвращены',delivery_problem:'Нужна дополнительная проверка доставки'};
export type CustomerOrderStatus=keyof typeof customerStatusLabels;
export function customerOrderStatus(input:{payment:string;order:string;fulfillment?:FulfillmentStatus|null;delivery?:DeliveryStatus|null}):CustomerOrderStatus{
 if(input.payment==='refunded')return 'refunded';
 if(input.delivery==='delivered')return 'delivered';
 if(input.delivery==='returned')return 'returned';
 if(input.delivery==='returning'||input.fulfillment==='returning')return 'returning';
 if(input.delivery==='review'||input.fulfillment==='review')return 'delivery_problem';
 if(input.delivery==='handed_to_cdek')return 'handed_to_delivery';
 if(input.delivery==='out_for_delivery')return 'in_transit';
 if(input.delivery&&input.delivery!=='created'&&input.delivery!=='cancelled')return input.delivery;
 if(input.order==='cancelled'||input.delivery==='cancelled'||input.fulfillment==='cancelled')return 'cancelled';
 if(!['paid','partially_refunded'].includes(input.payment))return 'pending_payment';
 if(input.fulfillment==='handed_to_delivery')return 'handed_to_delivery';
 if(input.fulfillment&&['accepted','assembling','assembled'].includes(input.fulfillment))return 'processing';
 return 'paid';
}
