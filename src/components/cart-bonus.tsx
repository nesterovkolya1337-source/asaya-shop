"use client";
import Link from 'next/link';
import {useState} from 'react';
import {requestCartPricing,type CartPricing} from '@/lib/cart-pricing';
import styles from './server-cart-view.module.css';
const rub=(minor:number)=>new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB'}).format(minor/100);
export function CartBonus({quote,items}:{quote:CartPricing;items:Array<{sku:string;quantity:number}>}){
 const [open,setOpen]=useState(false),[points,setPoints]=useState('0'),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [preview,setPreview]=useState<NonNullable<CartPricing['loyalty']>['preview']>(null);
 const loyalty=quote.loyalty;
 if(!loyalty)return <div className={styles.bonus}><p>Войдите, чтобы использовать и получать баллы ASAYA</p><Link href="/account/">Войти</Link></div>;
 async function calculate(){
  setBusy(true);setError('');setPreview(null);
  try{const result=await requestCartPricing(items,undefined,Number(points));setPreview(result.loyalty?.preview);}
  catch{setError('Не удалось рассчитать баллы. Проверьте сумму или обновите корзину.');}finally{setBusy(false);}
 }
 return <section className={styles.bonus} aria-label="Баллы ASAYA">
  <div className={styles.bonusHeading}><strong>Баллы ASAYA</strong><span>{loyalty.balance} баллов</span></div>
  {loyalty.balance>0&&<><p>Можно списать до {loyalty.maximum} ₽ · 1 балл = 1 ₽</p><button type="button" aria-expanded={open} onClick={()=>setOpen(!open)}>Рассчитать списание</button></>}
  <p>За этот заказ начислим {loyalty.cashbackPoints} баллов</p>
  {open&&<div className={styles.bonusControls}>
   <p>Списание пока недоступно. Здесь можно посмотреть предварительный расчёт; сумма заказа не изменится.</p>
   <label>Количество баллов<input type="number" min={0} max={loyalty.maximum} step={1} value={points} onChange={e=>{setPoints(e.target.value);setPreview(null);}}/></label>
   <button type="button" disabled={busy||!/^\d+$/.test(points)||Number(points)>loyalty.maximum} onClick={()=>void calculate()}>{busy?'Рассчитываем…':'Рассчитать'}</button>
   <button type="button" disabled={busy} onClick={()=>{setPoints('0');setPreview(null);setError('');}}>Сбросить</button>
   {error&&<p role="alert">{error}</p>}
   {preview&&<div aria-live="polite"><strong>Предварительный расчёт</strong><p>Баллы ASAYA: −{rub(preview.redeemedPoints*100)}</p><p>Товары после списания: {rub(preview.cashProductMinor)}</p><p>Начисление после списания: {preview.cashbackPoints} баллов</p><p>Баллы не списаны и не применены к оплате.</p></div>}
  </div>}
 </section>;
}
