"use client";
import {useEffect,useRef,useState} from 'react';
import {assetPath} from '@/lib/asset-path';
import {AuthClientError,orderLabels,paymentLabels,deliveryLabels,type OrderSummary} from '@/lib/auth-client';
import {createAdminOrdersClient,reviewSignalLabels,type AdminOrder} from '@/lib/admin-orders-client';
import type {StaffSession} from '@/lib/admin-client';
import styles from './server-admin.module.css';
import {AdminPrivacy} from './admin-privacy';
const api=createAdminOrdersClient(assetPath('/api/admin/v1'));
const price=(n:number)=>new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB'}).format(n/100);
export function AdminOrders({session,onExpired,initialOrderId}:{session:StaffSession;onExpired:()=>void;initialOrderId?:string}){
 const [items,setItems]=useState<OrderSummary[]>([]),[next,setNext]=useState<string|null>(null),[order,setOrder]=useState<AdminOrder|null>(null);
 const [search,setSearch]=useState(''),[status,setStatus]=useState(''),[payment,setPayment]=useState(''),[delivery,setDelivery]=useState(''),[applied,setApplied]=useState({search:'',status:'',payment:'',delivery:''});
 const [busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const lock=useRef(false),active=useRef(true),expired=useRef(onExpired);
 useEffect(()=>{expired.current=onExpired;},[onExpired]);
 function fail(e:unknown){if(e instanceof AuthClientError&&e.code==='UNAUTHENTICATED'){expired.current();return;}setError(e instanceof AuthClientError?({CDEK_REFRESH_COOLDOWN:'Статус недавно проверяли. Подождите до следующей попытки.',CDEK_REFRESH_FAILED:'Не удалось получить статус из СДЭК. Сохранённые данные не заменены.',SHIPMENT_NOT_FOUND:'Подтверждённая накладная не найдена.',CDEK_TRACKING_UNAVAILABLE:'Подключение статусов СДЭК ещё не включено.'}[e.code]??e.message):'Не удалось загрузить заказы.');}
 async function run(action:()=>Promise<void>){
  if(lock.current)return;lock.current=true;setBusy(true);setError('');setNotice('');
  try{await action();}catch(e){if(active.current)fail(e);}finally{lock.current=false;if(active.current)setBusy(false);}
 }
 useEffect(()=>{
  active.current=true;let disposed=false;
  queueMicrotask(()=>{if(disposed)return;void run(async()=>{const p=await api.list();if(initialOrderId)await open(initialOrderId);if(active.current){setItems(p.items);setNext(p.nextCursor);setLoaded(true);}});});
  return()=>{disposed=true;active.current=false;};
 // Initial load belongs to this mounted orders view; filters are applied explicitly.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[]);
 async function list(cursor?:string,reset=false){
  const filter=reset?{search:'',status:'',payment:'',delivery:''}:cursor?applied:{search,status,payment,delivery};const page=await api.list(filter.search,filter.status,cursor,filter);
  if(!active.current)return;
  setItems(previous=>cursor?[...previous,...page.items.filter(i=>!previous.some(p=>p.id===i.id))]:page.items);setNext(page.nextCursor);setApplied(filter);setLoaded(true);
  if(reset){setSearch('');setStatus('');setPayment('');setDelivery('');}
  if(!cursor){setOrder(null);}
 }
 async function open(id:string){setOrder(null);const d=await api.detail(id);if(active.current)setOrder(d);}
 function updateOrder(d:AdminOrder){
  setOrder(d);setItems(rows=>rows.flatMap(r=>r.id!==d.id?[r]:(applied.status&&applied.status!==d.status)||(applied.payment&&applied.payment!==d.payment_status)||(applied.delivery&&applied.delivery!==d.delivery_status)?[]:[d]));
 }
 return <section aria-label="Управление заказами" aria-busy={busy}>
 <h2>Заказы</h2><p>Заказы оформляет Яндекс Чекаут. Здесь — сохранённый состав, оплата, доставка и диагностика интеграций.</p>
 <form onSubmit={e=>{e.preventDefault();void run(()=>list());}}><fieldset disabled={busy}><div className={styles.columns}>
 <label>Номер заказа или отправления, имя, телефон<input maxLength={100} value={search} onChange={e=>setSearch(e.target.value)}/></label>
 <label>Статус заказа<select value={status} onChange={e=>setStatus(e.target.value)}><option value="">Все статусы</option>{Object.entries(orderLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
 <label>Оплата<select value={payment} onChange={e=>setPayment(e.target.value)}><option value="">Любая оплата</option>{Object.entries(paymentLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
 <label>Доставка<select value={delivery} onChange={e=>setDelivery(e.target.value)}><option value="">Любая доставка</option>{Object.entries(deliveryLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label></div>
 <button>Найти / обновить заказы</button><button type="button" onClick={()=>void run(()=>list(undefined,true))}>Сбросить фильтры</button></fieldset></form>
 {error&&<p role="alert" className={styles.notice}>{error}</p>}{notice&&<p role="status" className={styles.notice}>{notice}</p>}
 {busy&&!loaded&&<p role="status">Загружаем заказы…</p>}{loaded&&!items.length&&!error&&<p>Заказы не найдены.</p>}
 <ul className={styles.orderList}>{items.map(item=><li key={item.id}><div><strong>{item.public_number}</strong><p>{new Date(item.created_at).toLocaleString('ru-RU')} · {price(item.total_minor)}</p><p>{orderLabels[item.status]} · {paymentLabels[item.payment_status]} · {deliveryLabels[item.delivery_status]}</p></div><button disabled={busy} onClick={()=>void run(()=>open(item.id))}>Открыть {item.public_number}</button></li>)}</ul>
 {next&&<button disabled={busy} onClick={()=>void run(()=>list(next))}>Показать ещё заказы</button>}
 {order&&<article className={styles.editor}><header className={styles.header}><h3>Заказ {order.public_number}</h3><button disabled={busy} onClick={()=>{setOrder(null);}}>Закрыть заказ</button></header>
 <p>{orderLabels[order.status]} · {paymentLabels[order.payment_status]} · {deliveryLabels[order.delivery_status]}</p>
 {order.paymentOnDelivery&&<p className={styles.notice}>Оплата при получении. Яндекс подтвердил способ оплаты, но поступление денег ещё не подтверждено. После доставки потребуется сверка оплаты.</p>}
 {order.reviewSignals.length>0&&<section className={styles.notice} aria-label="События для проверки"><h3>События для проверки</h3>
 <ul>{order.reviewSignals.map(s=><li key={s.kind}><p>{reviewSignalLabels[s.kind]}</p><small>{new Date(s.createdAt).toLocaleString('ru-RU')}</small></li>)}</ul>
 <p>Это история сигналов. Сверьте результат в Яндексе и на складе: наличие записи не подтверждает возврат денег или товара.</p></section>}
 {order.status==='cancelled'&&order.payment_status==='paid'&&!order.reviewSignals.some(s=>['payment.late_review','ycp.placement_after_cancel','payment.refund_review'].includes(s.kind))&&<p className={styles.notice}>Заказ отменён, но оплата отмечена как полученная. Сверьте платёж и необходимость возврата.</p>}
 <section className={styles.diagnostics} aria-label="Диагностика заказа"><h3>Связь с Яндексом и СДЭК</h3><p>Создание отправления и отмена заказа выполняются в Яндексе. ASAYA получает статусы существующей отправки.</p><dl><dt>Внутренний ID</dt><dd>{order.id}</dd><dt>Статус для покупателя</dt><dd>{order.tracking?.label??orderLabels[order.status]}</dd>{order.diagnostics&&<>{([['Яндекс: ID заказа','yandexOrderId'],['Яндекс: номер заказа','yandexOrderNumber'],['Яндекс: сессия','yandexSessionId'],['СДЭК: UUID','cdekUuid'],['СДЭК: накладная','trackingNumber'],['СДЭК: исходный статус','rawDeliveryStatus']] as const).map(([label,key])=><div key={key}><dt>{label}</dt><dd>{order.diagnostics![key]??'Пока не получено'}</dd></div>)}<dt>Последнее обновление доставки</dt><dd>{order.diagnostics.lastDeliveryUpdate?new Date(order.diagnostics.lastDeliveryUpdate).toLocaleString('ru-RU'):'Ещё не обновлялось'}</dd></>}</dl>{order.diagnostics?.deliveryUpdateFailed&&<p role="alert">Последнее обновление из СДЭК не удалось.{order.diagnostics.nextDeliveryAttempt&&' Следующая попытка: '+new Date(order.diagnostics.nextDeliveryAttempt).toLocaleString('ru-RU')}</p>}<button disabled={busy||!order.diagnostics?.canRefresh} onClick={()=>void run(async()=>{await api.refreshDelivery(order.id,session.csrfToken);updateOrder(await api.detail(order.id));setNotice('Статус существующего отправления обновлён из СДЭК.');})}>Обновить статус из СДЭК</button>{!order.diagnostics?.canRefresh&&<p>Для обновления нужны подключение СДЭК и подтверждённая связь заказа с накладной.</p>}</section>
 <h3>Получатель</h3><p>{order.customer.name||'Имя не указано'} · {order.customer.phone||'Телефон не указан'}</p>
 <AdminPrivacy key={order.id} orderId={order.id} csrf={session.csrfToken} onChanged={()=>void run(async()=>{updateOrder(await api.detail(order.id));})}/>
 <h3>Доставка</h3><p>{order.delivery.label||'Способ не указан'}</p><p>{[order.delivery.city,order.delivery.address].filter(Boolean).join(', ')||'Адрес не указан'}</p>
 <h3>Состав заказа</h3><ul>{order.items.map(item=><li key={item.sku}><strong>{item.name_snapshot}</strong><p>{item.sku} · {item.quantity} шт. × {price(item.unit_minor)} = {price(item.line_minor)}</p></li>)}</ul>
 <p>Товары: {price(order.subtotal_minor)} · Доставка: {price(order.delivery_minor)}</p><p><strong>Итого: {price(order.total_minor)}</strong></p>
 <h3>История действий</h3><ul>{order.history.map((h,i)=><li key={i}>{new Date(h.createdAt).toLocaleString('ru-RU')} — {({'order.completed':'Получение подтверждено, заказ завершён','order.dispatched':'Передано перевозчику','order.packing_completed':'Комплектация подтверждена','order.processing_started':'Заказ взят в сборку','checkout.created':'Заказ создан','order.cancelled':'Заказ отменён','order.expired':'Истёк срок оплаты'} as Record<string,string>)[h.action]??(h.action.startsWith('status.')?({order:orderLabels,payment:paymentLabels,delivery:deliveryLabels} as Record<string,Record<string,string>>)[h.action.split('.')[1]]?.[h.action.split('.')[2]]??h.action:h.action)}{h.reason&&<p>Причина: {h.reason}</p>}<p>{h.actorId?'Участник: '+h.actorId:'Автоматическое действие'}</p></li>)}</ul>
 </article>}
 </section>;
}
