'use client';
import styles from './server-admin.module.css';
import {useEffect,useState} from 'react';
import {assetPath} from '@/lib/asset-path';
import {createStoreRequest} from '@/lib/auth-client';
import {adminError,type StaffSession} from '@/lib/admin-client';
// API DTO only: importing the server schema pulls database dependencies into web builds.
type PromoSettings={kind:'percent'|'fixed';value:number;active:boolean;startsAt:string|null;endsAt:string|null;minimumMinor:number;usageLimit:number|null};
const request=createStoreRequest(assetPath('/api/admin/v1'),fetch);
type Row={id:string;code:string;revision:number;settings:PromoSettings;uses:number};
const defaults:PromoSettings={kind:'percent',value:10,active:true,startsAt:null,endsAt:null,minimumMinor:0,usageLimit:null};
const localDate=(value:string|null)=>value?new Date(new Date(value).getTime()-new Date(value).getTimezoneOffset()*60000).toISOString().slice(0,16):'';
export function AdminPromocodes({session}:{session:StaffSession}){
 const [rows,setRows]=useState<Row[]>([]),[edit,setEdit]=useState<Row|null>(null),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 async function load(){setRows(((await request('promocodes','GET')) as {items:Row[]}).items);}
 useEffect(()=>{void load().catch(e=>setNotice(adminError(e)));},[]);
 const patch=(p:Partial<PromoSettings>)=>setEdit(e=>e?{...e,settings:{...e.settings,...p}}:e);
 async function save(row:Row){if(busy)return;setBusy(true);setNotice('');try{await request('promocodes/'+row.id,'PUT',{revision:row.revision,code:row.code,settings:row.settings},session.csrfToken);await load();setEdit(null);setNotice('Промокод сохранён.');}catch(e){setNotice(adminError(e));}finally{setBusy(false);}}
 return <section aria-label="Промокоды"><h2>Промокоды</h2><p>Применение промокодов в публичной корзине выключено до подтверждения связи заказа с Яндексом. Расчёт можно проверить только в локальном preview.</p>{notice&&<p role="status">{notice}</p>}<button type="button" disabled={busy} onClick={()=>setEdit({id:crypto.randomUUID(),revision:0,code:'',settings:{...defaults},uses:0})}>Создать промокод</button>
 {edit&&<form onSubmit={e=>{e.preventDefault();void save(edit);}}><h3>{edit.revision?'Редактирование':'Новый промокод'}</h3><fieldset disabled={busy}>
 <label>Код<input required maxLength={40} value={edit.code} onChange={e=>setEdit({...edit,code:e.target.value})}/></label>
 <label>Тип скидки<select value={edit.settings.kind} onChange={e=>patch({kind:e.target.value as PromoSettings['kind'],value:0})}><option value="percent">Процент</option><option value="fixed">Фиксированная сумма, ₽</option></select></label>
 <label>{edit.settings.kind==='percent'?'Скидка, %':'Скидка, ₽'}<input required type="number" min={0} max={edit.settings.kind==='percent'?100:100000000} step={edit.settings.kind==='percent'?1:.01} value={edit.settings.value/(edit.settings.kind==='fixed'?100:1)} onChange={e=>patch({value:Math.round(Number(e.target.value)*(edit.settings.kind==='fixed'?100:1))})}/></label>
 {(['startsAt','endsAt'] as const).map(k=><label key={k}>{k==='startsAt'?'Начало действия':'Окончание действия'}<input type="datetime-local" value={localDate(edit.settings[k])} onChange={e=>patch({[k]:e.target.value?new Date(e.target.value).toISOString():null})}/></label>)}
 <label>Минимальная сумма товаров, ₽<input type="number" min={0} step="0.01" value={edit.settings.minimumMinor/100} onChange={e=>patch({minimumMinor:Math.round(Number(e.target.value)*100)})}/></label>
 <label>Общий лимит использований (пусто — без лимита)<input type="number" min={1} step={1} value={edit.settings.usageLimit??''} onChange={e=>patch({usageLimit:e.target.value?Number(e.target.value):null})}/></label>
 <label className={styles.visibilityToggle}><input type="checkbox" role="switch" checked={edit.settings.active} onChange={e=>patch({active:e.target.checked})}/>Активен</label><p>Применяется ко всем товарам после скидки за количество.</p>
 <button type="submit">Сохранить промокод</button><button type="button" onClick={()=>setEdit(null)}>Отмена</button></fieldset></form>}
 <table><thead><tr><th>Код</th><th>Скидка</th><th>Период</th><th>Статус</th><th>Использования</th><th>Действия</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{r.code}</td><td>{r.settings.kind==='percent'?r.settings.value+'%':r.settings.value/100+' ₽'}</td><td>{r.settings.startsAt?new Date(r.settings.startsAt).toLocaleString('ru-RU'):'Без начала'} — {r.settings.endsAt?new Date(r.settings.endsAt).toLocaleString('ru-RU'):'Бессрочно'}</td><td>{!r.settings.active?'Неактивен':r.settings.endsAt&&Date.parse(r.settings.endsAt)<=Date.now()?'Истёк':r.settings.startsAt&&Date.parse(r.settings.startsAt)>Date.now()?'Запланирован':'Активен'}</td><td>{r.uses}{r.settings.usageLimit!==null?' / '+r.settings.usageLimit:''}</td><td><button type="button" disabled={busy} onClick={()=>setEdit(structuredClone(r))}>Редактировать</button>{r.settings.active&&<button type="button" disabled={busy} onClick={()=>void save({...r,settings:{...r.settings,active:false}})}>Отключить</button>}</td></tr>)}</tbody></table>{!rows.length&&<p>Промокодов пока нет.</p>}</section>;
}
