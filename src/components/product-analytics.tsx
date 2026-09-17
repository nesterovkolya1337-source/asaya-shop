'use client';
import {useEffect,useRef,useSyncExternalStore} from 'react';
import {usePathname} from 'next/navigation';
import {readCookieChoice,subscribeCookieChoice} from '@/lib/analytics-consent';
import {getProductAnalytics,observeProductImpression} from '@/lib/product-analytics';
import {useShop} from './shop-provider';
export function useProductImpression(sku?:string){
 const ref=useRef<HTMLElement>(null),choice=useSyncExternalStore(subscribeCookieChoice,readCookieChoice,()=>null);
 useEffect(()=>{if(choice!=='analytics'||!sku||!ref.current||typeof IntersectionObserver==='undefined')return;return observeProductImpression(ref.current,()=>{getProductAnalytics()?.track('product_impression',sku);});},[choice,sku]);
 return ref;
}
export function ProductAnalyticsBridge(){
 const {products,catalogStatus}=useShop(),path=usePathname();
 const choice=useSyncExternalStore(subscribeCookieChoice,readCookieChoice,()=>null);
 useEffect(()=>{
  // The hydration snapshot is unknown, not a withdrawal of consent. Clearing
  // persisted deduplication here would count every full reload as a new visit.
  if(choice===null)return;
  const analytics=getProductAnalytics();
  if(choice!=='analytics'){analytics?.stop();return;}
  void analytics?.flush();
  if(catalogStatus==='ready'&&path?.startsWith('/product/'))analytics?.track('product_open',products.find(p=>p.id===path.split('/')[2])?.sku);
 },[path,products,catalogStatus,choice]);
 return null;
}
