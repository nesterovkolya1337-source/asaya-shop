
'use client';
import {useEffect,useState} from 'react';
import {assetPath} from '@/lib/asset-path';
import {createStoreRequest} from '@/lib/auth-client';
import {type StaffSession,adminError} from '@/lib/admin-client';
const request=createStoreRequest(assetPath('/api/admin/v1'),fetch);
type Review={id:string;product_name:string;sku:string;customer_name:string;customer_id:string;rating:number;body:string;created_at:string;status:string;rewarded:boolean;reply:string};
export function AdminReviews({session}:{session:StaffSession}){
 const [items,setItems]=useState<Review[]>([]),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const load=()=>request('marketing/reviews','GET').then(v=>setItems((v as {items:Review[]}).items));
 useEffect(()=>{void load().catch(e=>setNotice(adminError(e)));},[]);
 async function act(id:string,body:unknown){setBusy(true);try{await request('marketing/reviews/'+id,'POST',body,session.csrfToken);await load();setNotice('Отзыв обновлён.');}catch(e){setNotice(adminError(e));}finally{setBusy(false);}}
 const statuses:Record<string,string>={pending:'На модерации',published:'Опубликован',hidden:'Скрыт',rejected:'Отклонён'};
 return <section aria-label="Отзывы"><h2>Отзывы</h2><p>Показать или скрыть валидный отзыв — начислить 100 баллов за первую подтверждённую покупку этого товара. Оценка не влияет на награду. Невалидные отзывы отклоняйте.</p>{notice&&<p role="status">{notice}</p>}{!items.length&&<p>Отзывов пока нет.</p>}{items.map(r=><article key={r.id}><h3>{r.product_name} · {r.sku}</h3><p>{r.customer_name||r.customer_id} · {new Date(r.created_at).toLocaleDateString('ru-RU')} · {r.rating}/5</p><p>{r.body}</p><p>{statuses[r.status]} · {r.rewarded?'100 баллов начислены':'Награда не начислена'}</p>
 <button disabled={busy} onClick={()=>void act(r.id,{action:'show'})}>Показать</button><button disabled={busy} onClick={()=>void act(r.id,{action:'hide'})}>Скрыть валидный отзыв</button>
 <form onSubmit={e=>{e.preventDefault();void act(r.id,{action:'reject',reason:new FormData(e.currentTarget).get('reason')});}}><select name="reason"><option value="spam">Спам</option><option value="duplicate">Дубликат</option><option value="abuse">Злоупотребление</option></select><button disabled={busy}>Отклонить как невалидный</button></form>
 <form onSubmit={e=>{e.preventDefault();void act(r.id,{action:'reply',reply:new FormData(e.currentTarget).get('reply')});}}><label>Ответ магазина<textarea key={r.reply} name="reply" defaultValue={r.reply} maxLength={5000}/></label><button disabled={busy}>Сохранить ответ</button></form></article>)}</section>;
}
export function ReplenishmentSettings({value,onChange}:{value:Record<string,number>;onChange:(value:Record<string,number>)=>void}){
 const [products,setProducts]=useState<Array<{id:string;name:string;sku:string}>>([]),[error,setError]=useState('');
 useEffect(()=>{void (async()=>{let offset:number|null=0;const result:typeof products=[];while(offset!==null){const page=await request('products?offset='+offset,'GET') as {items:typeof products;nextOffset:number|null};result.push(...page.items);offset=page.nextOffset;}setProducts(result);})().catch(()=>setError('Не удалось загрузить товары для настройки напоминаний.'));},[]);
 return <section><h2>Напоминания о повторной покупке</h2><p>Только в личном кабинете, без SMS, скидок и бонусов.</p>{error&&<p role="alert">{error}</p>}{products.map(p=><label key={p.id}>{p.name} ({p.sku})<select value={value[p.id]??0} onChange={e=>onChange({...value,[p.id]:Number(e.target.value)})}>{[0,30,45,60,90].map(n=><option key={n} value={n}>{n?n+' дней':'Выключено'}</option>)}</select></label>)}</section>;
}
