"use client";

import Link from 'next/link';
import {useCallback,useEffect,useRef,useState} from 'react';
import {createAuthClient,type ServerSession} from '@/lib/auth-client';
import {useShop} from '@/components/shop-provider';
import {ProductCard} from '@/components/product-card';
import {ServerOrders} from '@/components/server-orders';
import styles from './account-view.module.css';

// The callback lives at the public origin even when the editor is under /manage.
const auth=createAuthClient('/api/store/v1');
const callbackNotices:Record<string,string>={
 cancelled:'Вы отменили вход. Можно попробовать ещё раз.',
 error:'Не удалось завершить вход. Попробуйте ещё раз.',
 unavailable:'Вход через Яндекс пока недоступен. Попробуйте позже.'
};

export function YandexAccountView(){
 const [session,setSession]=useState<ServerSession|null>(null);
 const [methods,setMethods]=useState<{yandex:boolean;orders:boolean}|null>(null);
 const [checking,setChecking]=useState(true),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const operation=useRef(0),pending=useRef(false);
 const invalidate=useCallback(()=>{operation.current++;},[]);
 const {favorites,products}=useShop();
 const favoriteProducts=products.filter(product=>product.active&&favorites.includes(product.id));
 const refresh=useCallback(async()=>{
  if(pending.current)return;
  const version=++operation.current;setChecking(true);
  try{
   const [available,current]=await Promise.all([auth.methods(),auth.me()]);
   if(version!==operation.current)return;
   setMethods(available);setSession(current);
  }catch(error){
   if(version!==operation.current)return;
   setSession(null);setMethods(null);setNotice(error instanceof Error?error.message:'Не удалось проверить вход.');
  }finally{if(version===operation.current)setChecking(false);}
 },[]);
 useEffect(()=>{
  const url=new URL(window.location.href),outcome=url.searchParams.get('login');
  queueMicrotask(()=>{
   if(outcome)setNotice(callbackNotices[outcome]??'');
   void refresh();
  });
  if(outcome){url.searchParams.delete('login');window.history.replaceState(null,'',url.pathname+url.search+url.hash);}
  const onFocus=()=>{void refresh();};
  const onPageShow=(event:PageTransitionEvent)=>{if(event.persisted){pending.current=false;setBusy(false);void refresh();}};
  window.addEventListener('focus',onFocus);window.addEventListener('pageshow',onPageShow);
  return()=>{invalidate();window.removeEventListener('focus',onFocus);window.removeEventListener('pageshow',onPageShow);};
 },[refresh,invalidate]);
 async function start(){
  if(pending.current||!methods?.yandex)return;
  pending.current=true;setBusy(true);setNotice('');const version=++operation.current;
  try{
   const url=await auth.startYandex();
   if(version===operation.current)window.location.assign(url);
  }catch(error){
   if(version===operation.current){setNotice(error instanceof Error?error.message:'Не удалось начать вход.');setBusy(false);pending.current=false;}
  }
 }
 async function logout(){
  if(pending.current||!session)return;
  pending.current=true;setBusy(true);setNotice('');const version=++operation.current;
  try{await auth.logout(session);if(version===operation.current)setSession(null);}
  catch(error){if(version===operation.current)setNotice(error instanceof Error?error.message:'Не удалось выйти.');}
  finally{if(version===operation.current){pending.current=false;setBusy(false);}}
 }
 return <main className={styles.main}>
  <header className={styles.heading}><p>ASAYA / Профиль</p><h1>Личный кабинет</h1><span>Вход через ваш Яндекс ID.</span></header>
  <div className={styles.dashboard}>
   <section className={styles.loginCard} aria-labelledby="yandex-account-title" aria-busy={checking||busy}>
    <h2 id="yandex-account-title">{checking?'Проверяем вход…':session?'Вы вошли в ASAYA':'Добро пожаловать'}</h2>
    {!checking&&session&&<><span>Ваш аккаунт покупателя подключён через Яндекс ID.</span><button className={styles.logoutButton} disabled={busy} onClick={()=>void logout()} type="button">{busy?'Выходим…':'Выйти'}</button></>}
    {!checking&&!session&&methods?.yandex&&<>
     <span>Используйте аккаунт Яндекса, чтобы войти или зарегистрироваться в ASAYA.</span>
     <button className={styles.yandexLogin} disabled={busy} onClick={()=>void start()} type="button">{busy?'Переходим в Яндекс…':'Войти с Яндекс ID'}</button>
     <span className={styles.privacyNote}>Как мы работаем с данными — в <Link href="/legal/privacy/">политике конфиденциальности</Link>.</span>
    </>}
    {!checking&&!session&&methods&&!methods.yandex&&<span>Вход через Яндекс скоро появится.</span>}
    {!checking&&!methods&&<button className={styles.logoutButton} onClick={()=>{setNotice('');void refresh();}} type="button">Попробовать ещё раз</button>}
    {notice&&<div className={styles.notice} role="alert">{notice}</div>}
   </section>
   <section className={styles.orders} aria-labelledby="account-orders-title">
    <h2 id="account-orders-title">Мои заказы</h2>
    <span>{!checking&&methods?.orders?(session?'История заказов вашего аккаунта — ниже.':'Войдите, чтобы увидеть заказы своего аккаунта.'):'История заказов появится здесь после подключения.'}</span>
    <div className={styles.profileActions}><Link href="/catalog/">Перейти в каталог</Link></div>
   </section>
  </div>
  {!checking&&session&&methods?.orders&&<ServerOrders key={session.user.id} session={session} onSessionExpired={refresh}/>}
  <section className={styles.yandexFavorites} aria-labelledby="account-favorites-title">
   <h2 id="account-favorites-title">Избранное</h2><p>Сохранено в этом браузере.</p>
   {favoriteProducts.length?<div className={styles.favoriteGrid}>{favoriteProducts.map(product=><ProductCard key={product.id} product={product}/>)}</div>:<div className={styles.emptyFavorites}><p>Здесь будут товары, которые вам понравились.</p><Link href="/catalog/">Выбрать уход</Link></div>}
  </section>
 </main>;
}
