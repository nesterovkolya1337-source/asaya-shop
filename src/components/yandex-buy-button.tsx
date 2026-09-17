"use client";

import {useEffect,useRef,useState} from 'react';
import {assetPath} from '@/lib/asset-path';
import {requestYandexCheckoutLink,trackCheckoutTransition} from '@/lib/yandex-checkout';
import {getProductAnalytics} from '@/lib/product-analytics';
import {getMetrika} from '@/lib/metrika';
import styles from './yandex-buy-button.module.css';

export function YandexBuyButton({sku,stock,quantity=1}:{sku?:string;stock:number;quantity?:number}){
 if(!sku)return null;
 return <YandexCheckoutButton key={JSON.stringify([sku,quantity,stock])} items={[{sku,quantity}]} disabled={stock<quantity} />;
}

export function YandexCheckoutButton({items,disabled=false,label='Купить в 1 клик',compact=false}:{items:Array<{sku:string;quantity:number}>;disabled?:boolean;label?:string;compact?:boolean}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const pending=useRef(false);
 const active=useRef(false);
 useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
 if(process.env.NEXT_PUBLIC_CATALOG_SOURCE==='demo'||process.env.NEXT_PUBLIC_YANDEX_BUTTON!=='true')return null;
 const buy=async()=>{
  if(pending.current||disabled||!items.length)return;
  pending.current=true;setBusy(true);setError('');
  try{
   const url=await requestYandexCheckoutLink(assetPath('/api/store/v1/yandex/checkout-link'),items);
   if(active.current){for(const item of items)getProductAnalytics()?.track('checkout_started',item.sku);await trackCheckoutTransition(()=>getMetrika()?.checkoutRedirect());if(active.current)window.location.assign(url);}
  }
  catch(e){if(active.current)setError(e instanceof Error&&e.message.startsWith('Корзина')?e.message:'Оформление в Яндексе пока недоступно. Попробуйте позже.');}
  finally{pending.current=false;if(active.current)setBusy(false);}
 };
 return <div className={compact?styles.compact:styles.wrap}>
  <button type="button" className={styles.button} disabled={busy||disabled||!items.length} onClick={buy} aria-busy={busy}>
   {busy?'Переходим в Яндекс…':label}
  </button>
  {!compact&&<p className={styles.note}>Оформление и оплата — в Яндексе. Регистрация на ASAYA не нужна.</p>}
  {error&&<p className={styles.error} role="alert">{error}</p>}
 </div>;
}
