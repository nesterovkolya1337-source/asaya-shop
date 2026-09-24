"use client";
import {useEffect,useState} from 'react';
import {assetPath} from '@/lib/asset-path';
import {createStoreRequest,AuthClientError} from '@/lib/auth-client';
import {adminError,type StaffSession} from '@/lib/admin-client';
const request=createStoreRequest(assetPath('/api/admin/v1'),fetch);
export function AdminSales({session,onExpired}:{session:StaffSession;onExpired:()=>void}){
 const [state,setState]=useState<{enabled:boolean;revision:number}|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 function fail(e:unknown){if(e instanceof AuthClientError&&e.code==='UNAUTHENTICATED')onExpired();setError(adminError(e));}
 useEffect(()=>{let active=true;void request('sales','GET').then(v=>{if(active)setState(v as {enabled:boolean;revision:number});}).catch(e=>{if(active)fail(e);});return()=>{active=false;};},[]);
 async function toggle(){if(!state||busy)return;setBusy(true);setError('');try{setState(await request('sales','PUT',{enabled:!state.enabled,revision:state.revision},session.csrfToken) as {enabled:boolean;revision:number});}catch(e){fail(e);}finally{setBusy(false);}}
 return <section aria-label="Продажи на сайте"><h2>Продажи на сайте</h2><p>При закрытии продаж товары остаются опубликованными, но их нельзя добавить в корзину и оформить.</p>{state&&<><p role="status">{state.enabled?'Открыты':'Закрыты'}</p><button type="button" role="switch" aria-checked={state.enabled} aria-label="Продажи на сайте" disabled={busy} onClick={()=>void toggle()}>{busy?'Сохраняем…':state.enabled?'Закрыть продажи':'Открыть продажи'}</button><p>Изменение применяется сразу. Доступность товаров также зависит от реальных остатков и состояния склада.</p></>}{error&&<p role="alert">{error}</p>}</section>;
}
