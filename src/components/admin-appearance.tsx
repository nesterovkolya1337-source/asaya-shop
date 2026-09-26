"use client";
import {useEffect,useState} from 'react';
import {assetPath} from '@/lib/asset-path';
import {createStoreRequest,AuthClientError} from '@/lib/auth-client';
import {adminError} from '@/lib/admin-client';
import {readPdpOrder,type PdpBlock} from '../../backend/src/pdp-order';
const request=createStoreRequest(assetPath('/api/admin/v1'),fetch);
const labels:Record<PdpBlock,string>={reviews:'Отзывы',richContent:'Rich Content',recommendations:'Рекомендации'};
export function AdminAppearance({csrf,onExpired}:{csrf:string;onExpired:()=>void}){
 const [value,setValue]=useState<{order:PdpBlock[];revision:number}|null>(null),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 function error(e:unknown){if(e instanceof AuthClientError&&e.code==='UNAUTHENTICATED')onExpired();setNotice(adminError(e));}
 useEffect(()=>{let active=true;void request('appearance','GET').then(v=>{const r=v as {order:unknown;revision:number};if(active)setValue({order:readPdpOrder(r.order),revision:r.revision});}).catch(error);return()=>{active=false;};},[]);
 function move(i:number,d:number){if(!value)return;const order=[...value.order];[order[i],order[i+d]]=[order[i+d],order[i]];setValue({...value,order});}
 return <section aria-label="Оформление"><h2>Порядок блоков карточки товара</h2><p>Единый порядок для всех товаров на компьютере и телефоне. Отсутствующие блоки пропускаются.</p>{notice&&<p role="status">{notice}</p>}{value&&<form onSubmit={e=>{e.preventDefault();if(busy)return;setBusy(true);void request('appearance','PUT',value,csrf).then(v=>{setValue(v as typeof value);setNotice('Порядок сохранён.');}).catch(error).finally(()=>setBusy(false));}}><fieldset disabled={busy}><ol><li>Фото + основная информация — всегда первый блок</li>{value.order.map((block,i)=><li key={block} style={{padding:'12px 0',display:'flex',gap:12,alignItems:'center'}}><span>{i+2}. {labels[block]}</span><button type="button" aria-label={`Поднять ${labels[block]}`} disabled={i===0} onClick={()=>move(i,-1)}>↑</button><button type="button" aria-label={`Опустить ${labels[block]}`} disabled={i===2} onClick={()=>move(i,1)}>↓</button></li>)}</ol><button type="submit">Сохранить порядок</button></fieldset></form>}</section>;
}
