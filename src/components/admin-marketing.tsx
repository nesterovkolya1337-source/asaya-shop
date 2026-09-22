'use client';
import {AdminReviews,ReplenishmentSettings} from './admin-engagement';
import {useEffect,useState} from 'react';
import {assetPath} from '@/lib/asset-path';
import {createStoreRequest,AuthClientError} from '@/lib/auth-client';
import {adminError,type StaffSession} from '@/lib/admin-client';
type Config={replenishment?:Record<string,number>;twoPercent:number;threePercent:number;freeShippingMinor:number;loyalty?:{cashbackPercent:number;maxRedemptionPercent:number}};
type State={revision:number;defaults:Config;draft:Config;live:Config};
const request=createStoreRequest(assetPath('/api/admin/v1'),fetch);
const fields=[['twoPercent','Скидка на 2 товара, %'],['threePercent','Скидка на 3 и более товаров, %'],['freeShippingMinor','Бесплатная доставка в ПВЗ СДЭК от, ₽']] as const;
const equal=(a:Config,b:Config)=>fields.every(([key])=>a[key]===b[key])&&JSON.stringify(a.replenishment)===JSON.stringify(b.replenishment)&&JSON.stringify(a.loyalty)===JSON.stringify(b.loyalty);
export function AdminMarketing({session,onExpired}:{session:StaffSession;onExpired:()=>void}){
 const [state,setState]=useState<State|null>(null),[edit,setEdit]=useState<Config|null>(null),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[confirm,setConfirm]=useState(false);
 function accept(v:State){setState(v);setEdit(v.draft);}
 function fail(e:unknown){if(e instanceof AuthClientError&&e.code==='UNAUTHENTICATED')onExpired();setNotice(e instanceof AuthClientError&&e.code==='REVISION_CONFLICT'?'Настройки уже изменены другим сотрудником. Перезагрузите страницу перед сохранением.':adminError(e));}
 useEffect(()=>{let active=true;void request('marketing','GET').then(v=>{if(active)accept(v as State);}).catch(e=>{if(active)fail(e);});return()=>{active=false;};},[]);
 const dirty=!!state&&!!edit&&!equal(state.draft,edit);
 useEffect(()=>{if(!dirty)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
 async function act(action:string){if(busy||!state||!edit)return;setBusy(true);setNotice('');try{
  const result=await request('marketing/'+action,'POST',{revision:state.revision,...(['save','defaults'].includes(action)?{settings:edit}:{}),...(action==='defaults'?{confirmed:true}:{})},session.csrfToken) as State;
  setState(result);if(action!=='defaults')setEdit(result.draft);setConfirm(false);setNotice(action==='publish'?'Настройки опубликованы.':action==='defaults'?'Стандартные значения обновлены. Черновик и сайт не изменены.':'Черновик сохранён. Сайт не изменён.');
 }catch(e){fail(e);}finally{setBusy(false);}}
 return <section aria-label="Маркетинг"><h1>Маркетинг</h1><p>Сохраните черновик, затем опубликуйте его, чтобы применить настройки на сайте.</p><p>Порог бесплатной доставки в кабинете Яндекса должен совпадать с опубликованным здесь. Эти настройки обновляют сайт; условия доставки в Яндексе сохраняются отдельно.</p>{notice&&<p role="status">{notice}</p>}{state&&edit&&<>
 <p role="status">{equal(edit,state.defaults)?'Стандартное значение ASAYA':'Отличается от стандартных настроек'}</p>
 <form onSubmit={e=>{e.preventDefault();void act('save');}}><fieldset disabled={busy}>{fields.map(([key,label])=><label key={key}>{label}<input required type="number" min="0" max={key==='freeShippingMinor'?1000000:100} step={key==='freeShippingMinor'?'0.01':'1'} value={edit[key]/(key==='freeShippingMinor'?100:1)} onChange={e=>setEdit({...edit,[key]:Math.round(Number(e.target.value)*(key==='freeShippingMinor'?100:1))})}/><small>Стандарт: {state.defaults[key]/(key==='freeShippingMinor'?100:1)} · На сайте: {state.live[key]/(key==='freeShippingMinor'?100:1)}</small></label>)}
 <h2>Лояльность</h2><p>1 балл = 1 ₽. Списание в Яндекс ожидает подтверждения интеграции.</p>{(['cashbackPercent','maxRedemptionPercent'] as const).map(key=><label key={key}>{key==='cashbackPercent'?'Начисление баллов, %':'Максимальное списание, %'}<input type="number" required min={0} max={100} step={1} value={edit.loyalty?.[key]??(key==='cashbackPercent'?3:20)} onChange={e=>setEdit({...edit,loyalty:{cashbackPercent:3,maxRedemptionPercent:20,...edit.loyalty,[key]:Number(e.target.value)}})}/><small>Стандарт: {state.defaults.loyalty?.[key]??(key==='cashbackPercent'?3:20)} · На сайте: {state.live.loyalty?.[key]??(key==='cashbackPercent'?3:20)}</small></label>)}
 <ReplenishmentSettings value={edit.replenishment??{}} onChange={replenishment=>setEdit({...edit,replenishment})}/><button type="submit">Сохранить черновик</button><button type="button" disabled={dirty} onClick={()=>void act('publish')}>Опубликовать сохранённое</button><button type="button" onClick={()=>setEdit({...state.defaults})}>Вернуть стандартные значения</button>
 {dirty&&<p>Есть несохранённые изменения. Сначала сохраните черновик.</p>}
 {session.user.staffRole!=='manager'&&<button type="button" onClick={()=>setConfirm(true)}>Сохранить текущие как новые стандартные</button>}
 {confirm&&<div role="alert"><p>Заменить стандартные значения текущими? Сохранённый черновик и опубликованные настройки останутся прежними.</p><button type="button" onClick={()=>void act('defaults')}>Подтвердить замену стандартных</button><button type="button" onClick={()=>setConfirm(false)}>Отмена</button></div>}
 </fieldset></form></>}<AdminReviews session={session}/></section>;
}
