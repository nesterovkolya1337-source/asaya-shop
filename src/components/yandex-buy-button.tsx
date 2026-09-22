"use client";

import {useShop} from './shop-provider';
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

export function YandexCheckoutButton({items,disabled=false,label='Купить в 1 клик',compact=false,showNote=true,prepareItems,onConflict}:{items:Array<{sku:string;quantity:number}>;disabled?:boolean;label?:string;compact?:boolean;showNote?:boolean;prepareItems?:()=>Promise<Array<{sku:string;quantity:number}>|null>;onConflict?:()=>Promise<void>}){
 const {yandexCheckoutEnabled}=useShop();
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const pending=useRef(false);
 const active=useRef(false);
 useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
 if(!yandexCheckoutEnabled)return null;
 const buy=async()=>{
  if(pending.current||disabled||!items.length)return;
  pending.current=true;setBusy(true);setError('');
  try{
   const checked=prepareItems?await prepareItems():items;
   if(!active.current||!checked?.length)return;
   const url=await requestYandexCheckoutLink(assetPath('/api/store/v1/yandex/checkout-link'),checked);
   if(active.current){for(const item of checked)getProductAnalytics()?.track('checkout_started',item.sku);await trackCheckoutTransition(()=>getMetrika()?.checkoutRedirect());if(active.current)window.location.assign(url);}
  }
  catch(e){if(active.current){if(e instanceof Error&&e.message.startsWith('Корзина')&&onConflict)await onConflict().catch(()=>{});if(active.current)setError(e instanceof Error&&e.message.startsWith('Корзина')?e.message:'Оформление в Яндексе пока недоступно. Попробуйте позже.');}}
  finally{pending.current=false;if(active.current)setBusy(false);}
 };
 return <div className={compact?styles.compact:styles.wrap}>
  <button type="button" className={styles.button} disabled={busy||disabled||!items.length} onClick={buy} aria-busy={busy}>
   {busy?'Открываем оформление…':label}
  </button>
  {!compact&&showNote&&<p className={styles.note}>Оформление и оплата — в Яндексе. Регистрация на ASAYA не нужна.</p>}
  {error&&<p className={styles.error} role="alert">{error}</p>}
 </div>;
}
