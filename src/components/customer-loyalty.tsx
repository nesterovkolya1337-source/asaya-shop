'use client';
import {useEffect,useState} from 'react';
import {assetPath} from '@/lib/asset-path';
import {createStoreRequest,AuthClientError} from '@/lib/auth-client';
import styles from './customer-dashboard.module.css';
const request=createStoreRequest(assetPath('/api/store/v1'),fetch);
export function CustomerLoyalty({onExpired,compact=false,onDetails}:{onExpired:()=>void;compact?:boolean;onDetails?:()=>void}){
 const [data,setData]=useState<{balance:number;history:Array<{date:string;points:number;description:string;orderNumber:string|null;status:string}>}|null>(null),[error,setError]=useState('');
 useEffect(()=>{let active=true;void request('account/loyalty','GET').then(v=>{if(active)setData(v as NonNullable<typeof data>);}).catch(e=>{if(!active)return;if(e instanceof AuthClientError&&e.code==='UNAUTHENTICATED')onExpired();else setError('Не удалось загрузить бонусы. Попробуйте обновить страницу.');});return()=>{active=false;};},[onExpired]);
 if(compact)return <section className={styles.balanceCard} aria-label="Баланс баллов"><div><p>Ваши баллы ASAYA</p>{data?<h3>{data.balance} <small>баллов</small></h3>:<p role={error?"alert":"status"}>{error||"Загружаем баланс…"}</p>}</div><button type="button" onClick={onDetails}>К бонусам →</button></section>;
 return <section className={styles.panel} aria-label="Бонусы"><h2>Бонусы ASAYA</h2><p>1 балл = 1 ₽</p>{error&&<p role="alert">{error}</p>}{data?<><div className={styles.balanceCard}><h3>{data.balance} баллов</h3></div><p>Списание баллов при оформлении пока недоступно.</p><h3>История баллов</h3>{data.history.length?data.history.map((i,n)=><article key={n}><p>{new Date(i.date).toLocaleDateString('ru-RU')} · <strong>{i.points>0?'+':''}{i.points} баллов</strong></p><p>{i.description}{i.orderNumber?' · Заказ '+i.orderNumber:''}</p>{i.status==='review'&&<p>Корректировка требует проверки</p>}</article>):<p>Операций с баллами пока нет.</p>}</>:!error&&<p role="status">Загружаем бонусы…</p>}</section>;
}
