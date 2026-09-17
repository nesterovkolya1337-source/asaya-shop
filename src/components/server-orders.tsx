"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import {AuthClientError,createOrdersClient,orderLabels,paymentLabels,deliveryLabels,trackingLabels,type OrderSummary,type OrderDetail,type ServerSession} from '@/lib/auth-client';
import {assetPath} from '@/lib/asset-path';
import styles from './server-orders.module.css';
import Link from 'next/link';
import {useShop} from './shop-provider';

const api=createOrdersClient(assetPath('/api/store/v1'));
const price=(minor:number)=>new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',minimumFractionDigits:0,maximumFractionDigits:2}).format(minor/100);
const date=(value:string)=>new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',year:'numeric'}).format(new Date(value));
const calendarDate=(value:string)=>new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z'));

export function ServerOrders({session,onSessionExpired}:{session:ServerSession;onSessionExpired:()=>void}) {
 const {repeatOrder,checkoutEnabled}=useShop();
 const [repeatNotice,setRepeatNotice]=useState('');
 const repeatRequest=useRef<AbortController|null>(null);
 useEffect(()=>()=>repeatRequest.current?.abort(),[]);
 const [items,setItems]=useState<OrderSummary[]>([]);
 const [nextCursor,setNextCursor]=useState<string|null>(null);
 const [loaded,setLoaded]=useState(false);
 const [busy,setBusy]=useState(true);
 const [error,setError]=useState('');
 const [detail,setDetail]=useState<OrderDetail|null>(null);
 const [confirmCancel,setConfirmCancel]=useState(false);
 const pending=useRef(false);
 const operation=useRef(0);
 const invalidate=useCallback(()=>{operation.current++;},[]);
 const showError=useCallback((reason:unknown)=>{
  if(reason instanceof AuthClientError&&reason.code==='UNAUTHENTICATED'){onSessionExpired();return;}
  setError(reason instanceof Error?reason.message:'Не удалось загрузить заказы.');
 },[onSessionExpired]);

 const load=useCallback(async(cursor?:string)=>{
  if(pending.current)return;
  pending.current=true;setBusy(true);setError('');const version=++operation.current;
  if(!cursor){setDetail(null);setConfirmCancel(false);}
  try {
   const page=await api.list(cursor);
   if(operation.current!==version)return;
   setItems(current=>cursor?[...current,...page.items.filter(item=>!current.some(previous=>previous.id===item.id))]:page.items);
   setNextCursor(page.nextCursor);setLoaded(true);
  } catch(reason){if(operation.current===version)showError(reason);}
  finally {if(operation.current===version){pending.current=false;setBusy(false);}}
 },[showError]);

 useEffect(()=>{let disposed=false;queueMicrotask(()=>{if(!disposed)void load();});return ()=>{disposed=true;invalidate();};},[load,invalidate]);

 async function open(id:string) {
  if(pending.current)return;
  pending.current=true;setBusy(true);setError('');setRepeatNotice('');setDetail(null);setConfirmCancel(false);const version=++operation.current;
  try {const order=await api.detail(id);if(operation.current===version){setDetail(order);setItems(current=>current.map(item=>item.id===order.id?order:item));}}
  catch(reason){if(operation.current===version)showError(reason);}
  finally {if(operation.current===version){pending.current=false;setBusy(false);}}
 }

 async function repeat(){
  if(!detail||pending.current)return;pending.current=true;setBusy(true);setRepeatNotice('');const version=++operation.current;
  repeatRequest.current=new AbortController();
  try{const result=await repeatOrder(detail.items,repeatRequest.current.signal);if(operation.current===version)setRepeatNotice((result.added?`В корзину добавлено: ${result.added} шт. Цены обновлены по текущему каталогу.`:'Доступных товаров для повтора нет.')+(result.skipped.length?' Не все позиции доступны в прежнем количестве: '+result.skipped.join(', ')+'.':''));}
  catch(e){if(operation.current===version)setRepeatNotice(e instanceof Error?e.message:'Не удалось повторить заказ.');}
  finally{if(operation.current===version){pending.current=false;setBusy(false);}}
 }

 async function cancel() {
  if(pending.current||!detail||!confirmCancel)return;
  pending.current=true;setBusy(true);setError('');const version=++operation.current;
  try {
   await api.cancel(detail.id,session.csrfToken);
   const updated=await api.detail(detail.id);
   if(operation.current!==version)return;
   setDetail(updated);setConfirmCancel(false);setItems(current=>current.map(item=>item.id===updated.id?updated:item));
  } catch(reason) {
   if(operation.current!==version)return;
   setConfirmCancel(false);
   if(reason instanceof AuthClientError&&reason.code==='NETWORK_ERROR') {
    setDetail(null);setItems([]);setLoaded(false);setNextCursor(null);
    setError('Не удалось подтвердить результат отмены. Она могла выполниться — обновите список заказов.');
   } else showError(reason);
  } finally {if(operation.current===version){pending.current=false;setBusy(false);}}
 }

 return <section className={styles.section} id="account-orders" aria-labelledby="orders-title" aria-busy={busy}>
  <div className={styles.heading}><h2 id="orders-title">Мои заказы</h2><button disabled={busy} onClick={()=>void load()} type="button">Обновить список</button></div>
  {busy&&!loaded&&<p role="status">Загружаем заказы…</p>}
  {error&&<p className={styles.notice} role="alert">{error}</p>}
  {loaded&&!items.length&&!error&&<p className={styles.empty}>У вас пока нет заказов.</p>}
  <div className={styles.list}>
   {items.map(order=><article className={styles.card} key={order.id}>
    <div><h3>{order.public_number}</h3><p>{date(order.created_at)}</p></div>
    <div><strong>{price(order.total_minor)}</strong><p>{order.customer_status?trackingLabels[order.customer_status]:orderLabels[order.status]} · {paymentLabels[order.payment_status]}</p>{!order.customer_status&&<p>{deliveryLabels[order.delivery_status]}</p>}</div>
    <button disabled={busy} onClick={()=>void open(order.id)} type="button">Посмотреть {order.public_number}</button>
   </article>)}
  </div>
  {nextCursor&&<button disabled={busy} onClick={()=>void load(nextCursor)} type="button">Показать ещё</button>}
  {detail&&<article className={styles.detail} aria-labelledby="order-detail-title">
   <div className={styles.heading}><h3 id="order-detail-title">Заказ {detail.public_number}</h3><button disabled={busy} onClick={()=>{setDetail(null);setConfirmCancel(false);}} type="button">Закрыть</button></div>
   <p>{date(detail.created_at)} · {detail.tracking?.label??orderLabels[detail.status]}</p>
   <button disabled={busy} onClick={()=>void open(detail.id)} type="button">Обновить статус заказа</button>
   <dl className={styles.statuses}><div><dt>Оплата</dt><dd>{paymentLabels[detail.payment_status]}</dd></div><div><dt>Доставка</dt><dd>{detail.tracking?.label??deliveryLabels[detail.delivery_status]}</dd></div></dl>
   {(detail.tracking?.pickupPoint||detail.delivery?.pickupPoint)&&<p>Пункт выдачи: {detail.tracking?.pickupPoint??detail.delivery?.pickupPoint}</p>}
   {detail.tracking?.plannedDeliveryDate?<p>Плановая дата доставки: <time dateTime={detail.tracking.plannedDeliveryDate}>{calendarDate(detail.tracking.plannedDeliveryDate)}</time></p>:detail.delivery?.plannedStart&&<p>Ожидаемая доставка по заказу: {calendarDate(detail.delivery.plannedStart)}{detail.delivery.plannedEnd&&detail.delivery.plannedEnd!==detail.delivery.plannedStart?' — '+calendarDate(detail.delivery.plannedEnd):''}</p>}
   {detail.tracking&&<section aria-label="Отслеживание заказа"><ol className={styles.timeline}>{detail.tracking.history.map((event,i)=><li key={event.occurredAt+':'+i}><strong>{event.label}</strong><time dateTime={event.occurredAt}>{new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(event.occurredAt))}</time></li>)}</ol>{detail.tracking.trackingNumber&&<p>Номер отправления: <strong>{detail.tracking.trackingNumber}</strong> · <a href="https://www.cdek.ru/ru/tracking/" target="_blank" rel="noreferrer">Отследить на сайте СДЭК</a></p>}{detail.tracking.updatedAt&&<small>Последнее обновление: {new Date(detail.tracking.updatedAt).toLocaleString('ru-RU')}</small>}</section>}
   {!!detail.statusHistory?.length&&<ol className={styles.timeline} aria-label="История статусов">{detail.statusHistory.filter(h=>(!detail.tracking||h.kind==='payment'||(h.kind==='order'&&['draft','cancelled'].includes(h.status)))&&(h.kind==='order'?orderLabels:h.kind==='payment'?paymentLabels:h.kind==='delivery'?deliveryLabels:{})[h.status]).map((h,i)=><li key={h.occurred_at+':'+i}><strong>{(h.kind==='order'?orderLabels:h.kind==='payment'?paymentLabels:deliveryLabels)[h.status]}</strong><time dateTime={h.occurred_at}>{new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(h.occurred_at))}</time></li>)}</ol>}
   {detail.delivery&&<p className={styles.destination}>{[detail.delivery.label,detail.delivery.city,detail.delivery.address].filter(Boolean).join(' · ')}</p>}
   {detail.shipment&&<section className={styles.shipment} aria-label="Данные отправления"><h4>Ваше отправление</h4><dl className={styles.statuses}><div><dt>Перевозчик</dt><dd>{detail.shipment.carrier}</dd></div><div><dt>Номер отправления</dt><dd className={styles.tracking}>{detail.shipment.trackingNumber}</dd></div></dl><p>Для проверки на сайте перевозчика используйте номер отправления.</p></section>}
   <ul className={styles.items}>{detail.items.map(item=><li key={item.sku}><div><strong>{item.name_snapshot}</strong><p>{item.quantity} шт. × {price(item.unit_minor)}</p></div><strong>{price(item.line_minor)}</strong></li>)}</ul>
   <dl className={styles.totals}><div><dt>Товары</dt><dd>{price(detail.subtotal_minor)}</dd></div><div><dt>Доставка</dt><dd>{price(detail.delivery_minor)}</dd></div><div><dt>Итого</dt><dd>{price(detail.total_minor)}</dd></div></dl>
   <div className={styles.help}><button disabled={busy||!checkoutEnabled} onClick={()=>void repeat()} type="button">Повторить заказ</button><a href={'mailto:hello@asaya.ru?subject='+encodeURIComponent('Помощь по заказу '+detail.public_number)}>Нужна помощь по заказу</a><a href={'https://t.me/asayahelp?text='+encodeURIComponent('Здравствуйте! Вопрос по заказу '+detail.public_number)} target="_blank" rel="noreferrer">Написать в Telegram</a><Link href={'/returns/?order='+encodeURIComponent(detail.public_number)}>Возврат / претензия</Link></div>
   {repeatNotice&&<p className={styles.notice} role="status">{repeatNotice} <Link href="/cart/">Открыть корзину</Link></p>}
   {detail.status==='cancelled'&&detail.payment_status==='paid'&&<p className={styles.notice}>После отмены поступила оплата. Обратитесь в службу заботы для уточнения возврата.</p>}
   {detail.canCancel&&!confirmCancel&&<button disabled={busy} onClick={()=>setConfirmCancel(true)} type="button">Отменить заказ</button>}
   {confirmCancel&&<div className={styles.confirm}>
    <p>Отменить заказ {detail.public_number}? Зарезервированные товары снова станут доступны.</p>
    <button disabled={busy} onClick={()=>void cancel()} type="button">{busy?'Отменяем…':'Да, отменить заказ'}</button>
    <button disabled={busy} onClick={()=>setConfirmCancel(false)} type="button">Оставить заказ</button>
   </div>}
  </article>}
 </section>;
}
