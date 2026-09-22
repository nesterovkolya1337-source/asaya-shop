'use client';
import {useEffect,useState} from 'react';
import {AuthClientError,createAuthClient,type CustomerProfile,type ServerSession} from '@/lib/auth-client';
import {assetPath} from '@/lib/asset-path';
import {displayPhone} from '@/lib/customer-phone-input';
import {CustomerEngagement} from './customer-engagement';
import {CustomerLoyalty} from './customer-loyalty';
import {ServerOrders} from './server-orders';
import {CustomerProfileForm} from './customer-profile';
import styles from './customer-dashboard.module.css';

const auth=createAuthClient(assetPath('/api/store/v1'));
const sections=[{id:'overview',label:'Обзор'},{id:'orders',label:'Мои заказы'},{id:'profile',label:'Профиль'},{id:'bonuses',label:'Бонусы'}] as const;
type Section=typeof sections[number]['id'];
export function CustomerDashboard({session,onExpired,onLogout,busy}:{session:ServerSession;onExpired:()=>void;onLogout:()=>void;busy:boolean}) {
 const [section,setSection]=useState<Section>('overview');
 const [profile,setProfile]=useState<CustomerProfile|null>(null);
 const [error,setError]=useState('');
 useEffect(()=>{
  let active=true;
  void auth.profile().then(value=>{if(active)setProfile(value);}).catch(reason=>{
   if(!active)return;
   if(reason instanceof AuthClientError&&reason.code==='UNAUTHENTICATED')onExpired();
   else setError('Не удалось загрузить данные профиля.');
  });
  return()=>{active=false;};
 },[onExpired]);
 return <div className={styles.layout}>
  <aside className={styles.sidebar}>
   <p className={styles.brand}>МОЙ ASAYA</p>
   <nav aria-label="Разделы личного кабинета">{sections.map(item=><button key={item.id} type="button" aria-current={section===item.id?'page':undefined} onClick={()=>setSection(item.id)}>{item.label}</button>)}</nav>
   <button className={styles.logout} disabled={busy} type="button" onClick={onLogout}>{busy?'Выходим…':'Выйти'}</button>
  </aside>
  <div className={styles.content}>
   {section==='overview'&&<>
    <header className={styles.title}><p>Обзор</p><h2>{profile?.name?`Здравствуйте, ${profile.name}`:'Рады видеть вас в ASAYA'}</h2><span>Ваши покупки и данные — в одном месте.</span></header>
    <CustomerEngagement session={session} onExpired={onExpired}/>
    <ServerOrders key="overview" session={session} onSessionExpired={onExpired} preview onAll={()=>setSection('orders')}/>
    <section className={styles.profileSummary} aria-label="Кратко о профиле"><div><h3>Ваш профиль</h3>{profile?<p><span className={styles.verified}>Телефон подтверждён</span><br/>{displayPhone(profile.phone)}</p>:<p>{error||'Загружаем профиль…'}</p>}</div><button type="button" onClick={()=>setSection('profile')}>Изменить данные</button></section>
   </>}
   {section==='orders'&&<ServerOrders key="orders" session={session} onSessionExpired={onExpired}/>}
   {section==='bonuses'&&<CustomerLoyalty onExpired={onExpired}/>}
   {section==='profile'&&<CustomerProfileForm session={session} onExpired={onExpired} onSaved={setProfile}/>}
  </div>
 </div>;
}
