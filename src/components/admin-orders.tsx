"use client";
import {useEffect,useRef,useState} from 'react';
import {assetPath} from '@/lib/asset-path';
import {AuthClientError,orderLabels,paymentLabels,deliveryLabels,type OrderSummary} from '@/lib/auth-client';
import {createAdminOrdersClient,reviewSignalLabels,type AdminOrder} from '@/lib/admin-orders-client';
import type {StaffSession} from '@/lib/admin-client';
import styles from './server-admin.module.css';
import {OrderPackingSheet} from './order-packing-sheet';
const api=createAdminOrdersClient(assetPath('/api/admin/v1'));
const price=(n:number)=>new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB'}).format(n/100);
const fulfillmentLabels:Record<string,string>={prepared:'Готов к отправке',sending:'Передаётся на склад',uncertain:'Требуется сверить приём заказа',created:'Принят фулфилментом',review:'Требуется проверка'};
export function AdminOrders({session,onExpired,initialOrderId}:{session:StaffSession;onExpired:()=>void;initialOrderId?:string}){
 const [items,setItems]=useState<OrderSummary[]>([]),[next,setNext]=useState<string|null>(null),[order,setOrder]=useState<AdminOrder|null>(null);
 const [search,setSearch]=useState(''),[status,setStatus]=useState(''),[payment,setPayment]=useState(''),[delivery,setDelivery]=useState(''),[applied,setApplied]=useState({search:'',status:'',payment:'',delivery:''});
 const [packedCounts,setPackedCounts]=useState<Record<string,string>>({});
 const [sheet,setSheet]=useState<AdminOrder|null>(null);
 const [completionReason,setCompletionReason]=useState(''),[completionConfirmed,setCompletionConfirmed]=useState(false);
 const [carrier,setCarrier]=useState(''),[trackingNumber,setTrackingNumber]=useState(''),[dispatchConfirmed,setDispatchConfirmed]=useState(false);
 const [busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[confirm,setConfirm]=useState(false),[reason,setReason]=useState('');
 const lock=useRef(false),active=useRef(true),expired=useRef(onExpired);
 useEffect(()=>{expired.current=onExpired;},[onExpired]);
 function fail(e:unknown){if(e instanceof AuthClientError&&e.code==='UNAUTHENTICATED'){expired.current();return;}setError(e instanceof Error?e.message:'Не удалось загрузить заказы.');}
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
  if(!cursor){setOrder(null);setConfirm(false);setReason('');}
 }
 async function open(id:string){setOrder(null);setConfirm(false);setReason('');setPackedCounts({});setCarrier('');setTrackingNumber('');setDispatchConfirmed(false);setCompletionReason('');setCompletionConfirmed(false);const d=await api.detail(id);if(active.current)setOrder(d);}
 function updateOrder(d:AdminOrder){
  setOrder(d);setItems(rows=>rows.flatMap(r=>r.id!==d.id?[r]:(applied.status&&applied.status!==d.status)||(applied.payment&&applied.payment!==d.payment_status)||(applied.delivery&&applied.delivery!==d.delivery_status)?[]:[d]));
 }
 async function startProcessing(){
  if(!order)return;const id=order.id;
  try{
   await api.startProcessing(id,session.csrfToken);
   const d=await api.detail(id);if(!active.current)return;
   updateOrder(d);setNotice('Заказ взят в сборку. Товары остаются в резерве до отгрузки.');
  }catch(e){
   if(active.current){setOrder(null);setItems([]);setLoaded(false);setNext(null);}
   if(e instanceof AuthClientError&&['NETWORK_ERROR','INVALID_RESPONSE'].includes(e.code))throw new Error('Результат действия пока неизвестен. Обновите список: заказ мог уже перейти в сборку.');
   throw e;
  }
 }
 async function cancel(){
  if(!order||!confirm)return;const id=order.id;
  try{
   await api.cancel(id,reason.trim(),session.csrfToken);
   const d=await api.detail(id);if(!active.current)return;
   updateOrder(d);setConfirm(false);setReason('');setNotice('Заказ отменён. Резерв освобождён.');
  }catch(e){
   if(active.current){setOrder(null);setItems([]);setLoaded(false);setNext(null);setConfirm(false);}
   if(e instanceof AuthClientError&&['NETWORK_ERROR','INVALID_RESPONSE'].includes(e.code))throw new Error('Результат отмены пока неизвестен. Обновите список: отмена могла выполниться.');
   throw e;
  }
 }
 async function completePacking(){
  if(!order||!order.items.every(i=>packedCounts[i.sku]?.trim()&&Number(packedCounts[i.sku])===i.quantity))return;
  const id=order.id;
  try{
   await api.completePacking(id,order.items.map(i=>({sku:i.sku,quantity:Number(packedCounts[i.sku])})),session.csrfToken);
   const d=await api.detail(id);if(!active.current)return;
   if(!d.packing)throw new AuthClientError('INVALID_RESPONSE');
   updateOrder(d);setPackedCounts({});setNotice('Комплектация подтверждена. Заказ готов к оформлению отгрузки.');
  }catch(e){
   if(active.current){setOrder(null);setItems([]);setLoaded(false);setNext(null);setPackedCounts({});}
   if(e instanceof AuthClientError&&['NETWORK_ERROR','INVALID_RESPONSE'].includes(e.code))throw new Error('Результат подтверждения пока неизвестен. Обновите список: комплектация могла уже сохраниться.');
   throw e;
  }
 }
 async function dispatch(){
  if(!order||!dispatchConfirmed)return;const id=order.id;
  try{
   await api.dispatch(id,{carrier:carrier.trim(),trackingNumber:trackingNumber.trim(),confirmed:true},session.csrfToken);
   const d=await api.detail(id);if(!active.current)return;
   if(!d.dispatch)throw new AuthClientError('INVALID_RESPONSE');
   updateOrder(d);setDispatchConfirmed(false);setNotice('Отгрузка сохранена. Товары списаны, резерв снят.');
  }catch(e){
   if(active.current){setOrder(null);setItems([]);setLoaded(false);setNext(null);setDispatchConfirmed(false);}
   if(e instanceof AuthClientError&&['NETWORK_ERROR','INVALID_RESPONSE'].includes(e.code))throw new Error('Результат отгрузки пока неизвестен. Обновите список: запись и списание могли уже сохраниться.');
   throw e;
  }
 }
 async function complete(){
  if(!order||!completionConfirmed||completionReason.trim().length<3)return;const id=order.id;
  try{
   await api.complete(id,{reason:completionReason.trim(),confirmed:true},session.csrfToken);
   const d=await api.detail(id);if(!active.current)return;
   if(!d.completion)throw new AuthClientError('INVALID_RESPONSE');
   updateOrder(d);setCompletionConfirmed(false);setCompletionReason('');setNotice('Получение подтверждено. Заказ завершён.');
  }catch(e){
   if(active.current){setOrder(null);setItems([]);setLoaded(false);setNext(null);setCompletionConfirmed(false);}
   if(e instanceof AuthClientError&&['NETWORK_ERROR','INVALID_RESPONSE'].includes(e.code))throw new Error('Результат завершения пока неизвестен. Обновите список: подтверждение могло сохраниться.');
   throw e;
  }
 }
 return <section aria-label="Управление заказами" aria-busy={busy}>
 <h2>Заказы</h2><p>В сборку доступны оплаченные заказы и подтверждённые Яндексом заказы с оплатой при получении. Суммы и состав сохранены на момент оформления.</p>
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
 {order&&<article className={styles.editor}><header className={styles.header}><h3>Заказ {order.public_number}</h3><button disabled={busy} onClick={()=>{setOrder(null);setConfirm(false);}}>Закрыть заказ</button></header>
 <p>{orderLabels[order.status]} · {paymentLabels[order.payment_status]} · {deliveryLabels[order.delivery_status]}</p>
 {order.fulfillment&&<section className={styles.notice} aria-label="СДЭК Фулфилмент"><h3>СДЭК Фулфилмент</h3><p>{fulfillmentLabels[order.fulfillment.state]}</p><p>Номер ASAYA в фулфилменте: {order.fulfillment.externalKey}</p>{order.fulfillment.orderId&&<p>Заказ ФФ: {order.fulfillment.orderId}</p>}{order.fulfillment.rawStatus&&<p>Статус склада: {order.fulfillment.rawStatus}</p>}{order.fulfillment.trackingNumber&&<p>Накладная СДЭК: {order.fulfillment.trackingNumber}</p>}{order.fulfillment.updatedAt&&<p>Проверено: {new Date(order.fulfillment.updatedAt).toLocaleString('ru-RU')}</p>}<button disabled={busy} onClick={()=>void run(async()=>{const id=order.id;const state=await api.recheckFulfillment(id,session.csrfToken);await open(id);setNotice(state==='created'?'Заказ найден, данные обновлены.':'Заказ пока не найден. Повторная заявка не отправлялась.');})}>Сверить с фулфилментом</button></section>}
 {order.paymentOnDelivery&&<p className={styles.notice}>Оплата при получении. Яндекс подтвердил способ оплаты, но поступление денег ещё не подтверждено. После доставки потребуется сверка оплаты.</p>}
 {order.reviewSignals.length>0&&<section className={styles.notice} aria-label="События для проверки"><h3>События для проверки</h3>
 <ul>{order.reviewSignals.map(s=><li key={s.kind}><p>{reviewSignalLabels[s.kind]}</p><small>{new Date(s.createdAt).toLocaleString('ru-RU')}</small></li>)}</ul>
 <p>Это история сигналов. Сверьте результат в Яндексе и на складе: наличие записи не подтверждает возврат денег или товара.</p></section>}
 <button disabled={busy} onClick={()=>void run(async()=>{const fresh=await api.detail(order.id);if(active.current){updateOrder(fresh);setSheet(fresh);}})}>Лист сборки</button>
 {!order.fulfillment&&order.status==='placed'&&(order.payment_status==='paid'||order.paymentOnDelivery)&&order.delivery_status==='not_created'&&<button disabled={busy} onClick={()=>void run(startProcessing)}>Взять в сборку</button>}
 {!order.fulfillment&&order.status==='processing'&&order.delivery_status==='preparing'&&!order.packing&&<p>Заказ в сборке. Товары зарезервированы; отгрузка ещё не оформлена.</p>}
 {order.status==='cancelled'&&order.payment_status==='paid'&&!order.reviewSignals.some(s=>['payment.late_review','ycp.placement_after_cancel','payment.refund_review'].includes(s.kind))&&<p className={styles.notice}>Заказ отменён, но оплата отмечена как полученная. Сверьте платёж и необходимость возврата.</p>}
 <h3>Получатель</h3><p>{order.customer.name||'Имя не указано'} · {order.customer.phone||'Телефон не указан'}</p>
 <h3>Доставка</h3><p>{order.delivery.label||'Способ не указан'}</p><p>{[order.delivery.city,order.delivery.address].filter(Boolean).join(', ')||'Адрес не указан'}</p>
 <h3>Состав заказа</h3><ul>{order.items.map(item=><li key={item.sku}><strong>{item.name_snapshot}</strong><p>{item.sku} · {item.quantity} шт. × {price(item.unit_minor)} = {price(item.line_minor)}</p></li>)}</ul>
 <p>Товары: {price(order.subtotal_minor)} · Доставка: {price(order.delivery_minor)}</p><p><strong>Итого: {price(order.total_minor)}</strong></p>
 {order.packing&&<section className={styles.notice} aria-label="Подтверждённая комплектация"><h3>Комплектация подтверждена</h3><p>{new Date(order.packing.packedAt).toLocaleString('ru-RU')} · Сотрудник: {order.packing.packedBy}</p>{!order.fulfillment&&order.status==='processing'&&(order.payment_status==='paid'||order.paymentOnDelivery)&&order.delivery_status==='preparing'&&<p>Готов к оформлению отгрузки. Товары остаются в резерве.</p>}</section>}
 {!order.fulfillment&&!order.packing&&order.status==='processing'&&(order.payment_status==='paid'||order.paymentOnDelivery)&&order.delivery_status==='preparing'&&<form onSubmit={e=>{e.preventDefault();void run(completePacking);}} aria-label="Проверка комплектации"><fieldset disabled={busy}><h3>Проверка комплектации</h3><p>Сверьте товары и введите фактически собранное количество каждой позиции. Подтверждение сохраняется для всего заказа.</p>
 {order.items.map(item=><label key={item.sku}>Собрано: {item.name_snapshot} ({item.sku})<small>В заказе: {item.quantity} шт.</small><input required type="number" min={0} max={100} step={1} value={packedCounts[item.sku]??''} onChange={e=>setPackedCounts(v=>({...v,[item.sku]:e.target.value}))}/></label>)}
 <button disabled={!order.items.every(i=>packedCounts[i.sku]?.trim()&&Number(packedCounts[i.sku])===i.quantity)}>Подтвердить комплектацию</button></fieldset></form>}
 {order.dispatch&&<section className={styles.notice} aria-label="Сохранённая отгрузка"><h3>Передано перевозчику</h3><p>{order.dispatch.carrier} · Номер отправления: {order.dispatch.trackingNumber}</p><p>{new Date(order.dispatch.dispatchedAt).toLocaleString('ru-RU')} · Сотрудник: {order.dispatch.dispatchedBy}</p><p>Товары списаны со склада, резерв снят.</p></section>}
 {!order.fulfillment&&order.packing&&!order.dispatch&&order.status==='processing'&&(order.payment_status==='paid'||order.paymentOnDelivery)&&order.delivery_status==='preparing'&&<form aria-label="Фиксация отгрузки" onSubmit={e=>{e.preventDefault();void run(dispatch);}}><fieldset disabled={busy}><h3>Зафиксировать отгрузку</h3><p>Заполните после фактической передачи товаров перевозчику. Это спишет товары со склада и снимет резерв. Заявка перевозчику здесь не создаётся.</p><label>Перевозчик<input required maxLength={100} value={carrier} onChange={e=>{setCarrier(e.target.value);setDispatchConfirmed(false);}}/></label><label>Номер отправления<input required maxLength={100} pattern="[A-Za-z0-9А-Яа-яЁё _\-]+" value={trackingNumber} onChange={e=>{setTrackingNumber(e.target.value);setDispatchConfirmed(false);}}/></label><label><input type="checkbox" checked={dispatchConfirmed} onChange={e=>setDispatchConfirmed(e.target.checked)}/>Товары переданы перевозчику, данные отправления проверены</label><button disabled={!dispatchConfirmed||!carrier.trim()||!trackingNumber.trim()}>Подтвердить отгрузку</button></fieldset></form>}
 {order.completion&&<section className={styles.notice} aria-label="Подтверждённое получение"><h3>Заказ получен покупателем</h3><p>{order.completion.reason}</p><p>{new Date(order.completion.completedAt).toLocaleString('ru-RU')} · Подтвердил сотрудник: {order.completion.completedBy}</p></section>}
 {!order.fulfillment&&order.dispatch&&!order.completion&&order.status==='processing'&&order.payment_status==='paid'&&['shipped','arrived_to_pickup_point'].includes(order.delivery_status)&&<form aria-label="Подтверждение получения" onSubmit={e=>{e.preventDefault();void run(complete);}}><fieldset disabled={busy}><h3>Подтвердить получение покупателем</h3><p>Завершайте заказ после получения товаров покупателем. Прибытие в пункт выдачи ещё не означает получение.</p><label>Основание подтверждения<textarea required minLength={3} maxLength={1000} placeholder="Например: получение подтверждено покупателем или перевозчиком" value={completionReason} onChange={e=>{setCompletionReason(e.target.value);setCompletionConfirmed(false);}}/></label><label><input type="checkbox" checked={completionConfirmed} onChange={e=>setCompletionConfirmed(e.target.checked)}/>Покупатель получил заказ, подтверждение проверено</label><button disabled={!completionConfirmed||completionReason.trim().length<3}>Завершить заказ</button></fieldset></form>}
 {order.canCancel&&!confirm&&<button disabled={busy} onClick={()=>setConfirm(true)}>Отменить заказ</button>}
 {confirm&&<form onSubmit={e=>{e.preventDefault();void run(cancel);}} className={styles.notice}><fieldset disabled={busy}><p>Отменить {order.public_number}? Зарезервированные товары снова станут доступны.</p><label>Причина отмены<textarea required minLength={3} maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)}/></label><button disabled={reason.trim().length<3}>Подтвердить отмену</button><button type="button" onClick={()=>setConfirm(false)}>Не отменять</button></fieldset></form>}
 <h3>История действий</h3><ul>{order.history.map((h,i)=><li key={i}>{new Date(h.createdAt).toLocaleString('ru-RU')} — {({'order.completed':'Получение подтверждено, заказ завершён','order.dispatched':'Передано перевозчику','order.packing_completed':'Комплектация подтверждена','order.processing_started':'Заказ взят в сборку','checkout.created':'Заказ создан','order.cancelled':'Заказ отменён','order.expired':'Истёк срок оплаты'} as Record<string,string>)[h.action]??(h.action.startsWith('status.')?({order:orderLabels,payment:paymentLabels,delivery:deliveryLabels} as Record<string,Record<string,string>>)[h.action.split('.')[1]]?.[h.action.split('.')[2]]??h.action:h.action)}{h.reason&&<p>Причина: {h.reason}</p>}<p>{h.actorId?'Участник: '+h.actorId:'Автоматическое действие'}</p></li>)}</ul>
 </article>}
 {sheet&&<OrderPackingSheet order={sheet} onClose={()=>setSheet(null)}/>}
 </section>;
}
