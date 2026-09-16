"use client";
import {useEffect,useRef} from 'react';
import {createPortal} from 'react-dom';
import type {AdminOrder} from '@/lib/admin-orders-client';
import {orderLabels,paymentLabels,deliveryLabels} from '@/lib/auth-client';
import styles from './order-packing-sheet.module.css';

export function OrderPackingSheet({order,onClose}:{order:AdminOrder;onClose:()=>void}){
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const dialog=ref.current;dialog?.showModal();return()=>dialog?.close();},[]);
 const canAssemble=order.payment_status==='paid'&&((order.status==='placed'&&order.delivery_status==='not_created')||(order.status==='processing'&&order.delivery_status==='preparing'));
 return createPortal(<dialog ref={ref} data-packing-sheet="true" className={styles.dialog} aria-labelledby="packing-sheet-title" onCancel={onClose}>
  <div className={styles.actions}><button onClick={()=>window.print()}>Печать</button><button onClick={onClose}>Закрыть лист сборки</button></div>
  <header><p>ASAYA · Лист сборки</p><h2 id="packing-sheet-title">{order.public_number}</h2><p>Заказ от {new Date(order.created_at).toLocaleString('ru-RU')}</p></header>
  <p>{orderLabels[order.status]} · {paymentLabels[order.payment_status]} · {deliveryLabels[order.delivery_status]}</p>
  {!canAssemble&&<p className={styles.warning}>Не использовать для новой сборки: проверьте текущий статус заказа.</p>}
  {order.packing&&<p>Комплектация подтверждена {new Date(order.packing.packedAt).toLocaleString('ru-RU')}.</p>}
  <section><h3>Получатель</h3><p>{order.customer.name||'Имя не указано'} · {order.customer.phone||'Телефон не указан'}</p><h3>Доставка</h3><p>{order.delivery.label||'Способ не указан'}</p><p>{[order.delivery.city,order.delivery.address].filter(Boolean).join(', ')||'Адрес не указан'}</p></section>
  <table><caption>Состав заказа — {order.items.reduce((sum,i)=>sum+i.quantity,0)} шт.</caption><thead><tr><th scope="col">Товар / артикул</th><th scope="col">Кол-во</th><th scope="col">Собрано</th></tr></thead><tbody>{order.items.map(i=><tr key={i.sku}><td><strong>{i.name_snapshot}</strong><br/><span>{i.sku}</span></td><td>{i.quantity} шт.</td><td>________</td></tr>)}</tbody></table>
  <footer><p>Собрал: ____________________ Дата: ____________________</p><p>Сверил: ____________________</p><p>Отметки на бумаге не подтверждают комплектацию в системе. После проверки внесите собранное количество в карточку заказа.</p></footer>
 </dialog>,document.body);
}
