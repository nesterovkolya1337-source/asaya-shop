'use client';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {AuthClientError,createAuthClient,type CustomerProfile,type ServerSession} from '@/lib/auth-client';
import {assetPath} from '@/lib/asset-path';
import {displayPhone} from '@/lib/customer-phone-input';
import styles from './customer-profile.module.css';
const auth=createAuthClient(assetPath('/api/store/v1'));
export function CustomerProfileForm({session,onExpired,onSaved}:{session:ServerSession;onExpired:()=>void;onSaved?:(profile:CustomerProfile)=>void}){
 const [profile,setProfile]=useState<CustomerProfile|null>(null),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),alive=useRef(false),pending=useRef(false);
 useEffect(()=>{alive.current=true;let valid=true;void auth.profile().then(p=>{if(valid)setProfile(p);}).catch(e=>{if(!valid)return;if(e instanceof AuthClientError&&e.code==='UNAUTHENTICATED')onExpired();else setNotice(e instanceof Error?e.message:'Не удалось загрузить профиль.');});return()=>{valid=false;alive.current=false;};},[session.user.id,onExpired]);
 useEffect(()=>{if(notice!=='Изменения сохранены')return;const timer=setTimeout(()=>setNotice(''),4000);return()=>clearTimeout(timer);},[notice]);
 async function save(e:FormEvent){e.preventDefault();if(!profile||pending.current)return;pending.current=true;setBusy(true);setNotice('');try{const p=await auth.saveProfile({name:profile.name.trim(),email:profile.email.trim()},session.csrfToken);if(alive.current){setProfile(p);onSaved?.(p);setNotice('Изменения сохранены');}}catch(e){if(alive.current){if(e instanceof AuthClientError&&e.code==='UNAUTHENTICATED')onExpired();else setNotice(e instanceof Error?e.message:'Не удалось сохранить профиль.');}}finally{pending.current=false;if(alive.current)setBusy(false);}}
 return <section className={styles.profile} aria-label="Мой профиль"><h2>Профиль</h2><p>Здесь можно изменить имя и почту. Заполнять их необязательно.</p>{profile?<form onSubmit={save}><fieldset disabled={busy}><label>Телефон подтверждён<input readOnly value={displayPhone(profile.phone)} autoComplete="tel"/></label><label>Имя · необязательно<input value={profile.name} autoComplete="name" maxLength={200} onChange={e=>setProfile({...profile,name:e.target.value})}/></label><label>Почта · необязательно<input type="email" autoComplete="email" maxLength={254} value={profile.email} onChange={e=>setProfile({...profile,email:e.target.value})}/></label><button>{busy?'Сохраняем…':'Сохранить изменения'}</button></fieldset></form>:!notice&&<p>Загружаем профиль…</p>}{notice&&<p role="status">{notice}</p>}</section>;
}
