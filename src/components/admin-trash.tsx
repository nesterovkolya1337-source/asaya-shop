
'use client';
import {useEffect,useState} from 'react';
import {assetPath} from '@/lib/asset-path';
import {createStoreRequest} from '@/lib/auth-client';
import {adminError,type StaffSession} from '@/lib/admin-client';
const request=createStoreRequest(assetPath('/api/admin/v1'),fetch);
type Item={kind:'product'|'media';id:string;name:string;deleted_at:string;deleted_by:string|null;days_left:number|null;ever_published:boolean};
export function AdminTrash({session}:{session:StaffSession}){
 const [items,setItems]=useState<Item[]>([]),[assets,setAssets]=useState<Array<{id:string}>>([]),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[confirm,setConfirm]=useState<Item|null>(null);
 async function load(){const [trash,media]=await Promise.all([request('trash','GET'),request('media','GET')]);setItems((trash as {items:Item[]}).items);setAssets((media as {items:typeof assets}).items);}
 useEffect(()=>{void load().catch(e=>setNotice(adminError(e)));},[]);
 async function act(path:string,body:unknown={}){setBusy(true);try{await request(path,'POST',body,session.csrfToken);setConfirm(null);await load();setNotice('Готово.');}catch(e){setNotice(adminError(e));}finally{setBusy(false);}}
 return <section><h1>Корзина и архив</h1><p>Удалённые черновики и изображения хранятся 30 дней. Ранее опубликованные товары — в архиве бессрочно. Восстановление не публикует товар.</p>{notice&&<p role="status">{notice}</p>}{items.map(i=><article key={i.kind+i.id}><h3>{i.name}</h3><p>{i.kind==='product'?'Товар':'Изображение'} · {new Date(i.deleted_at).toLocaleString('ru-RU')} · Удалил: {i.deleted_by??'Нет данных'} · {i.ever_published?'Архив · без срока удаления':'Осталось дней: '+i.days_left}</p><button disabled={busy} onClick={()=>void act('trash/'+i.kind+'/'+i.id+'/restore')}>Восстановить</button>{!i.ever_published&&<button disabled={busy} onClick={()=>setConfirm(i)}>Удалить навсегда</button>}</article>)}
 {confirm&&<div role="dialog" aria-modal="true" aria-label="Окончательное удаление"><p>Удалить «{confirm.name}» без возможности восстановления?</p><button disabled={busy} onClick={()=>void act('trash/'+confirm.kind+'/'+confirm.id+'/purge',{confirmed:true})}>Подтвердить окончательное удаление</button><button onClick={()=>setConfirm(null)}>Отмена</button></div>}
 <details><summary>Загруженные изображения</summary><p>Изображения с активными ссылками удалить нельзя.</p>{assets.map(a=><p key={a.id}><a target="_blank" rel="noreferrer" href={assetPath('/api/store/v1/media/'+a.id)}>{a.id}</a> <button disabled={busy} onClick={()=>void act('media/'+a.id+'/delete')}>В корзину</button></p>)}</details></section>;
}
