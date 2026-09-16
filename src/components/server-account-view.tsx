"use client";

import Link from 'next/link';
import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {createAuthClient,type AuthChannel,type OtpChallenge,type ServerSession} from '@/lib/auth-client';
import {assetPath} from '@/lib/asset-path';
import {ServerOrders} from './server-orders';
import styles from './account-view.module.css';
import {useShop} from './shop-provider';
import {normalizeCustomerPhone} from '../../backend/src/customer-phone';
import {CustomerProfileForm} from './customer-profile';

const auth=createAuthClient(assetPath('/api/store/v1'));
type Challenge=OtpChallenge & {destination:string;channel:AuthChannel;expiresAt:number;retryAt:number};
type View='checking'|'guest'|'signed-in'|'error';

export function ServerAccountView({smsOnly=false}:{smsOnly?:boolean}) {
 const {checkoutEnabled:cartEnabled,yandexCheckoutEnabled}=useShop();
 const checkoutEnabled=cartEnabled&&!yandexCheckoutEnabled;
 const [view,setView]=useState<View>('checking');
 const [session,setSession]=useState<ServerSession|null>(null);
 const [channel,setChannel]=useState<AuthChannel>(smsOnly?'sms':'email');
 const [smsAvailable,setSmsAvailable]=useState(!smsOnly);
 const [destination,setDestination]=useState('');
 const [challenge,setChallenge]=useState<Challenge|null>(null);
 const [code,setCode]=useState('');
 const [notice,setNotice]=useState('');
 const [busy,setBusy]=useState(false);
 const [now,setNow]=useState(0);
 const operation=useRef(0);
 const pending=useRef(false);
 const invalidate=useCallback(()=>{operation.current++;},[]);

 const refresh=useCallback(async()=>{
  if(pending.current)return;
  const version=++operation.current;
  setView('checking');setNotice('');
  try {
   const [current,methods]=await Promise.all([auth.me(),smsOnly?auth.methods():Promise.resolve(null)]);
   if(operation.current!==version)return;
   setSession(current);setView(current?'signed-in':'guest');
   if(smsOnly)setSmsAvailable(methods?.sms===true);
   if(current){setChallenge(null);setCode('');setDestination('');}
  } catch(error) {
   if(operation.current!==version)return;
   setSession(null);setView('error');setNotice(error instanceof Error?error.message:'Не удалось проверить вход.');
  }
 },[smsOnly]);

 useEffect(()=>{
  queueMicrotask(()=>{void refresh();});
  const onFocus=()=>{void refresh();};
  window.addEventListener('focus',onFocus);
  return ()=>{invalidate();window.removeEventListener('focus',onFocus);};
 },[refresh,invalidate]);

 useEffect(()=>{
  if(!challenge)return;
  const timer=setInterval(()=>setNow(Date.now()),1000);
  return ()=>clearInterval(timer);
 },[challenge]);

 async function sendCode(event?:FormEvent) {
  event?.preventDefault();
  if(pending.current || (smsOnly&&!smsAvailable) || (challenge && Date.now()<challenge.retryAt))return;
  const rawTarget=challenge?.destination??destination.trim();
  const method=challenge?.channel??channel;
  const target=method==='sms'?normalizeCustomerPhone(rawTarget):rawTarget;
  if(!target){setNotice('Введите номер телефона в формате +7 999 123-45-67.');return;}
  pending.current=true;setBusy(true);setNotice('');
  const version=++operation.current;
  // A resend always targets the same destination as the visible challenge.
  try {
   const sent=await auth.sendCode(method,target);
   if(operation.current!==version)return;
   const at=Date.now();setNow(at);setCode('');
   setChallenge({...sent,destination:target,channel:method,expiresAt:at+sent.expiresInSeconds*1000,retryAt:at+sent.retryAfterSeconds*1000});
  } catch(error) {
   if(operation.current===version) {
    setNotice(error instanceof Error?error.message:'Не удалось отправить код.');
    // A failed resend may already have invalidated the previous code on the server.
    if(challenge){setDestination(target);setChannel(method);setChallenge(null);setCode('');}
   }
  } finally {if(operation.current===version){pending.current=false;setBusy(false);}}
 }

 async function verify(event:FormEvent) {
  event.preventDefault();
  if(pending.current||!challenge||Date.now()>=challenge.expiresAt)return;
  pending.current=true;setBusy(true);setNotice('');const version=++operation.current;
  try {
   const signed=await auth.verify(challenge.challengeId,code);
   if(operation.current!==version)return;
   setSession(signed);setView('signed-in');setChallenge(null);setCode('');setDestination('');
  } catch(error) {if(operation.current===version)setNotice(error instanceof Error?error.message:'Не удалось проверить код.');}
  finally {if(operation.current===version){pending.current=false;setBusy(false);}}
 }

 async function logout() {
  if(pending.current||!session)return;
  pending.current=true;setBusy(true);setNotice('');const version=++operation.current;
  try {
   await auth.logout(session);
   if(operation.current!==version)return;
   setSession(null);setView('guest');setChallenge(null);setCode('');setDestination('');
  } catch(error) {if(operation.current===version)setNotice(error instanceof Error?error.message:'Не удалось выйти.');}
  finally {if(operation.current===version){pending.current=false;setBusy(false);}}
 }

 const retrySeconds=challenge?Math.max(0,Math.ceil((challenge.retryAt-now)/1000)):0;
 const expired=challenge!==null&&now>=challenge.expiresAt;
 return <main className={styles.main}>
  <header className={styles.heading}><p>ASAYA / Профиль</p><h1>Личный кабинет</h1><span>{smsOnly?'Вход по номеру телефона и коду из SMS.':'Вход по одноразовому коду.'}</span></header>
  <div className={styles.dashboard}>
   <section className={styles.loginCard} aria-labelledby="server-account-title" aria-busy={busy||view==='checking'}>
    <h2 id="server-account-title">{view==='signed-in'?'Вы вошли в аккаунт':view==='checking'?'Проверяем вход…':'Вход в аккаунт'}</h2>
    {view==='error' && <button className={styles.logoutButton} onClick={()=>void refresh()} type="button">Проверить вход ещё раз</button>}
    {view==='signed-in' && <><span>Вход подтверждён. Сессия сохранится после обновления страницы.</span><button className={styles.logoutButton} disabled={busy} onClick={()=>void logout()} type="button">{busy?'Выходим…':'Выйти'}</button></>}
    {view==='guest' && (!challenge ? <>
     {!smsOnly&&<div className={styles.authChannels} role="group" aria-label="Способ получения кода">
      <button aria-pressed={channel==='email'} disabled={busy} onClick={()=>{setChannel('email');setDestination('');setNotice('');}} type="button">По почте</button>
      <button aria-pressed={channel==='sms'} disabled={busy} onClick={()=>{setChannel('sms');setDestination('');setNotice('');}} type="button">По SMS</button>
     </div>}
     <form onSubmit={sendCode}>
      <label>{channel==='email'?'Email':'Телефон'}<input autoComplete={channel==='email'?'email':'tel'} disabled={busy} maxLength={channel==='sms'?32:254}
       onChange={event=>setDestination(event.target.value)} placeholder={channel==='email'?'name@example.com':'+7 999 123-45-67'}
       required type={channel==='email'?'email':'tel'} value={destination}/></label>
      <button disabled={busy||(smsOnly&&!smsAvailable)} type="submit">{busy?'Отправляем…':'Получить код'}</button>
     </form>
     <span>{smsOnly&&!smsAvailable?'Вход по SMS пока недоступен. Каталог открыт для просмотра.':'Подтвердите номер кодом из SMS. После входа вы сможете увидеть свои заказы.'}</span>
     <Link href="/legal/privacy/">Политика конфиденциальности</Link>
    </> : <>
     <span>Код отправлен на {challenge.destination}. Срок действия — {Math.ceil(challenge.expiresInSeconds/60)} мин.</span>
     <form onSubmit={verify}>
      <label>Код из 6 цифр<input autoComplete="one-time-code" disabled={busy||expired} inputMode="numeric" maxLength={6}
       onChange={event=>setCode(event.target.value.replace(/\D/g,''))} pattern="[0-9]{6}" required type="text" value={code}/></label>
      <button disabled={busy||expired||code.length!==6} type="submit">{busy?'Подождите…':'Войти'}</button>
     </form>
     {expired && <div className={styles.notice} role="status">Срок действия кода истёк. Запросите новый.</div>}
     <div className={styles.authChannels}>
      <button disabled={busy||retrySeconds>0} onClick={()=>void sendCode()} type="button">{retrySeconds>0?`Новый код через ${retrySeconds} с`:'Отправить код ещё раз'}</button>
      <button disabled={busy} onClick={()=>{setChallenge(null);setCode('');setNotice('');}} type="button">Изменить номер</button>
     </div>
     <button className={styles.logoutButton} disabled={busy} onClick={()=>void refresh()} type="button">Проверить состояние входа</button>
    </>)}
    {notice && <div className={styles.notice} role="alert">{notice}</div>}
   </section>
   <section className={styles.orders}><p>ASAYA</p><h2>Ваш уход начинается здесь</h2><span>{yandexCheckoutEnabled?'Покупки оформляются в Яндексе. Здесь отображаются заказы, привязанные к аккаунту сайта.':view==='signed-in'?(checkoutEnabled?'Ваши заказы, их состав и статус доступны ниже. Можно оформить тестовый заказ.':'Ваши заказы, их состав и статус доступны ниже. Новые покупки пока закрыты.'):'Войдите, чтобы посмотреть свои заказы. Каталог доступен для просмотра.'}</span><div className={styles.orderActions}><Link href="/catalog">Перейти в каталог</Link>{checkoutEnabled&&view==='signed-in'&&<Link href="/checkout">Оформить тестовый заказ</Link>}</div></section>
  </div>
  {view==='signed-in'&&session&&<>{smsOnly&&<CustomerProfileForm key={'profile:'+session.user.id} session={session} onExpired={refresh}/>}<div id="orders"><ServerOrders key={session.user.id} session={session} onSessionExpired={refresh}/></div></>}
 </main>;
}
