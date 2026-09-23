"use client";

import Link from 'next/link';
import {SMS_CONSENT_VERSION,SMS_CONSENT_URL,SMS_CONSENT_LABEL} from '../../backend/src/sms-consent-policy';
import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {AuthClientError,createAuthClient,type AuthChannel,type OtpChallenge,type ServerSession} from '@/lib/auth-client';
import {assetPath} from '@/lib/asset-path';
import styles from './customer-account.module.css';
import {CustomerPhoneInput} from './customer-phone-input';
import {displayPhone} from '@/lib/customer-phone-input';
import {normalizeCustomerPhone} from '../../backend/src/customer-phone';
import {CustomerDashboard} from './customer-dashboard';

const auth=createAuthClient(assetPath('/api/store/v1'));
type Challenge=OtpChallenge & {destination:string;channel:AuthChannel;expiresAt:number;retryAt:number};
type View='checking'|'guest'|'signed-in'|'error';

export function ServerAccountView({smsOnly=false}:{smsOnly?:boolean}) {
 const [view,setView]=useState<View>('checking');
 const [session,setSession]=useState<ServerSession|null>(null);
 const [channel,setChannel]=useState<AuthChannel>(smsOnly?'sms':'email');
 const [smsAvailable,setSmsAvailable]=useState(!smsOnly);
 const [destination,setDestination]=useState('');
 const [challenge,setChallenge]=useState<Challenge|null>(null);
 const phone=normalizeCustomerPhone(destination);
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
   const sent=await auth.sendCode(method,target,method==='sms'?{accepted:true,version:SMS_CONSENT_VERSION}:undefined);
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
  <header className={styles.heading}><div><p>ASAYA / Профиль</p><h1>Личный кабинет</h1></div></header>
  {view!=='signed-in'&&<div className={styles.dashboard}>
   <section className={styles.loginCard} aria-labelledby="server-account-title" aria-busy={busy||view==='checking'}>
    <h2 id="server-account-title">{view==='checking'?'Загружаем…':challenge?'Введите код из SMS':smsOnly?'Войдите по номеру телефона':'Вход в аккаунт'}</h2>
    {view==='error' && <button className={styles.logoutButton} onClick={()=>void refresh()} type="button">Попробовать снова</button>}
    {view==='guest' && (!challenge ? <>
     {smsOnly&&<p>Если вы у нас впервые, личный кабинет создастся автоматически после подтверждения номера.</p>}
     {!smsOnly&&<div className={styles.authChannels} role="group" aria-label="Способ получения кода">
      <button aria-pressed={channel==='email'} disabled={busy} onClick={()=>{setChannel('email');setDestination('');setNotice('');}} type="button">По почте</button>
      <button aria-pressed={channel==='sms'} disabled={busy} onClick={()=>{setChannel('sms');setDestination('');setNotice('');}} type="button">По SMS</button>
     </div>}
     <form onSubmit={sendCode}>
      <label>{channel==='email'?'Email':'Телефон'}{channel==='sms'?<CustomerPhoneInput value={destination} onChange={setDestination} disabled={busy}/>:<input autoComplete="email" disabled={busy} maxLength={254} onChange={event=>setDestination(event.target.value)} placeholder="name@example.com" required type="email" value={destination}/>}</label>
      {channel==='sms'&&<p className={styles.smsConsent}>{SMS_CONSENT_LABEL} <Link href={SMS_CONSENT_URL} target="_blank" rel="noopener">Условия</Link></p>}
      <button disabled={busy||(smsOnly&&!smsAvailable)||(channel==='sms'&&!phone)} type="submit">{busy?'Отправляем…':'Получить код'}</button>
     </form>
     {smsOnly&&!smsAvailable&&<p role="status">Вход по SMS пока недоступен. Попробуйте позже.</p>}

    </> : <>
     <p>Отправили код на <strong>{challenge.channel==='sms'?displayPhone(challenge.destination):challenge.destination}</strong>. Код действует {Math.ceil(challenge.expiresInSeconds/60)} мин.</p>
     <form onSubmit={verify}>
      <label>Код из 6 цифр<input autoComplete="one-time-code" disabled={busy||expired} inputMode="numeric" maxLength={6}
       onChange={event=>setCode(event.target.value.replace(/\D/g,''))} pattern="[0-9]{6}" required type="text" value={code}/></label>
      <button disabled={busy||expired||code.length!==6} type="submit">{busy?'Подождите…':'Войти'}</button>
     </form>
     {expired && <div className={styles.notice} role="status">Срок действия кода истёк. Запросите новый.</div>}
     <div className={styles.authChannels}>
      <button disabled={busy||retrySeconds>0} onClick={()=>void sendCode()} type="button">{retrySeconds>0?`Новый код через ${retrySeconds} с`:'Получить новый код'}</button>
      <button disabled={busy} onClick={()=>{setChallenge(null);setCode('');setNotice('');}} type="button">Изменить номер</button>
     </div>
    </>)}
    {notice && <div className={styles.notice} role="alert">{notice}</div>}
   </section>
  </div>}
  {view==='signed-in'&&session&&<>{notice&&<div className={styles.notice} role="alert">{notice}</div>}<CustomerDashboard key={session.user.id} session={session} onExpired={refresh} onLogout={()=>void logout()} busy={busy}/></>}
 </main>;
}
