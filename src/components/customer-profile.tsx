'use client';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {AuthClientError,createAuthClient,type CustomerProfile,type ServerSession} from '@/lib/auth-client';
import {assetPath} from '@/lib/asset-path';
import styles from './customer-profile.module.css';
const auth=createAuthClient(assetPath('/api/store/v1'));
export function CustomerProfileForm({session,onExpired}:{session:ServerSession;onExpired:()=>void}){
 const [profile,setProfile]=useState<CustomerProfile|null>(null),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),alive=useRef(false),pending=useRef(false);
 useEffect(()=>{alive.current=true;let valid=true;void auth.profile().then(p=>{if(valid)setProfile(p);}).catch(e=>{if(!valid)return;if(e instanceof AuthClientError&&e.code==='UNAUTHENTICATED')onExpired();else setNotice(e instanceof Error?e.message:'Не удалось загрузить профиль.');});return()=>{valid=false;alive.current=false;};},[session.user.id,onExpired]);
 async function save(e:FormEvent){e.preventDefault();if(!profile||pending.current)return;pending.current=true;setBusy(true);setNotice('');try{const p=await auth.saveProfile({name:profile.name.trim(),email:profile.email.trim()},session.csrfToken);if(alive.current){setProfile(p);setNotice('Профиль сохранён.');}}catch(e){if(alive.current){if(e instanceof AuthClientError&&e.code==='UNAUTHENTICATED')onExpired();else setNotice(e instanceof Error?e.message:'Не удалось сохранить профиль.');}}finally{pending.current=false;if(alive.current)setBusy(false);}}
 return <section className={styles.profile} aria-label="Мой профиль"><h2>Мой профиль</h2>{profile?<form onSubmit={save}><fieldset disabled={busy}><label>Телефон подтверждён<input readOnly value={profile.phone} autoComplete="tel"/></label><label>Имя · необязательно<input value={profile.name} autoComplete="name" maxLength={200} onChange={e=>setProfile({...profile,name:e.target.value})}/></label><label>Почта · необязательно<input type="email" autoComplete="email" maxLength={254} value={profile.email} onChange={e=>setProfile({...profile,email:e.target.value})}/></label><button>{busy?'Сохраняем…':'Сохранить профиль'}</button></fieldset></form>:!notice&&<p>Загружаем профиль…</p>}{notice&&<p role="status">{notice}</p>}</section>;
}
