'use client';
import styles from './server-admin.module.css';
import {useEffect,useState} from 'react';
import {assetPath} from '@/lib/asset-path';
import {createStoreRequest,AuthClientError} from '@/lib/auth-client';
import {adminError} from '@/lib/admin-client';
import type {StorefrontBanner} from '@/lib/storefront-banner';
const request=createStoreRequest(assetPath('/api/admin/v1'),fetch);
type Props={csrf:string;onExpired:()=>void};
export function AdminBanner({csrf,onExpired}:Props){
 const [v,setV]=useState<StorefrontBanner|null>(null),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 function error(e:unknown){if(e instanceof AuthClientError&&e.code==='UNAUTHENTICATED')onExpired();setNotice(adminError(e));}
 useEffect(()=>{let active=true;void request('banner','GET').then(r=>{if(active)setV(r as StorefrontBanner);}).catch(e=>{if(active)error(e);});return()=>{active=false;};},[]);
 return <section aria-label="Предупреждающий баннер"><h2>Предупреждающий баннер</h2><p>Показывается только по решению администратора.</p>{notice&&<p role="status">{notice}</p>}{v&&<form onSubmit={e=>{e.preventDefault();if(busy)return;setBusy(true);void request('banner','PUT',v,csrf).then(r=>{setV({...v,revision:(r as {revision:number}).revision});setNotice('Баннер сохранён.');}).catch(error).finally(()=>setBusy(false));}}><fieldset disabled={busy}><label className={styles.visibilityToggle}><input type="checkbox" role="switch" checked={v.enabled} onChange={e=>setV({...v,enabled:e.target.checked})}/>Показывать баннер</label><label>Текст сообщения<textarea required={v.enabled} maxLength={2000} value={v.message} onChange={e=>setV({...v,message:e.target.value})}/></label><label>Текст кнопки<input maxLength={100} value={v.buttonText} onChange={e=>setV({...v,buttonText:e.target.value})}/></label><label>Ссылка кнопки<input maxLength={1000} value={v.buttonUrl} onChange={e=>setV({...v,buttonUrl:e.target.value})}/></label><button>Сохранить баннер</button></fieldset></form>}</section>;
}
export function AdminTestStock({id,csrf,onExpired,onSaved,disabled=false}:Props&{id:string;onSaved:()=>void;disabled?:boolean}){
 const [v,setV]=useState<{enabled:boolean;quantity:number;revision:number;real:number}|null>(null),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');const path='products/'+id+'/test-stock';
 function error(e:unknown){if(e instanceof AuthClientError&&e.code==='UNAUTHENTICATED')onExpired();setNotice(adminError(e));}
 useEffect(()=>{let active=true;void request(path,'GET').then(r=>{if(active)setV(r as NonNullable<typeof v>);}).catch(e=>{if(active)error(e);});return()=>{active=false;};},[path]);
 return <section aria-label="Тестовые остатки"><h3>Реальный и тестовый остаток</h3>{notice&&<p role="status">{notice}</p>}{v&&<><p>Реальный остаток: <strong>{v.real}</strong> · данные stock-layer ASAYA</p>{v.enabled&&<strong role="status">Тестовый режим</strong>}<p>Только для проверки сайта и перехода в Яндекс. Яндекс проверит реальный остаток. Резервы не создаются.</p><form onSubmit={e=>{e.preventDefault();if(busy)return;setBusy(true);void request(path,'PUT',{enabled:v.enabled,quantity:v.quantity,revision:v.revision},csrf).then(async()=>{setV(await request(path,'GET') as NonNullable<typeof v>);onSaved();try{localStorage.setItem('asaya-stock-updated',String(Date.now()));}catch{}setNotice('Тестовый остаток сохранён. Реальный остаток не изменён.');}).catch(error).finally(()=>setBusy(false));}}><fieldset disabled={busy||disabled}><label><input type="checkbox" checked={v.enabled} onChange={e=>setV({...v,enabled:e.target.checked})}/>Тестовый режим товара</label><label>Тестовый остаток<input type="number" min={0} max={1000000} step={1} required value={v.quantity} onChange={e=>setV({...v,quantity:Number(e.target.value)})}/></label><button>Сохранить тестовый остаток</button></fieldset></form></>}</section>;
}

