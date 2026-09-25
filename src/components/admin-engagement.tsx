
'use client';
import {useEffect,useState} from 'react';
import {assetPath} from '@/lib/asset-path';
import {createStoreRequest} from '@/lib/auth-client';
import {type StaffSession,adminError} from '@/lib/admin-client';
const request=createStoreRequest(assetPath('/api/admin/v1'),fetch);
type Review={id:string;product_image?:string;product_name:string;sku:string;customer_name:string;customer_id:string|null;rating:number;body:string;created_at:string;review_date:string;status:string;source:string;rewarded:boolean;reply:string};
export function AdminReviews({session}:{session:StaffSession}){
 const [items,setItems]=useState<Review[]>([]),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const [status,setStatus]=useState('pending'),[search,setSearch]=useState(''),[rating,setRating]=useState(''),[answer,setAnswer]=useState(''),[date,setDate]=useState(''),[selected,setSelected]=useState<string|null>(null),[page,setPage]=useState(0);
 const load=()=>request('marketing/reviews','GET').then(v=>setItems((v as {items:Review[]}).items));
 useEffect(()=>{void load().catch(e=>setNotice(adminError(e)));},[]);
 useEffect(()=>setPage(0),[status,search,rating,answer,date]);
 async function act(id:string,body:unknown){setBusy(true);try{await request('marketing/reviews/'+id,'POST',body,session.csrfToken);await load();setNotice('Отзыв обновлён.');}catch(e){setNotice(adminError(e));}finally{setBusy(false);}}
 const statuses:Record<string,string>={pending:'На модерации',published:'Опубликованы',hidden:'Скрытые'};
 const filtered=items.filter(r=>(status==='hidden'?['hidden','rejected'].includes(r.status):r.status===status)&&(!rating||r.rating===Number(rating))&&(!date||r.review_date.slice(0,10)===date)&&(!answer||(answer==='yes'?!!r.reply:!r.reply))&&[r.sku,r.product_name,r.customer_name].join(' ').toLowerCase().includes(search.toLowerCase()));
 const detail=items.find(r=>r.id===selected);
 return <section aria-label="Отзывы"><h2>Отзывы</h2><nav aria-label="Статусы отзывов">{Object.entries(statuses).map(([key,label])=><button key={key} aria-pressed={status===key} onClick={()=>setStatus(key)}>{label}</button>)}</nav>
 <div style={{display:'flex',gap:12,flexWrap:'wrap',margin:'20px 0'}}><label>Поиск по SKU, товару, автору<input value={search} onChange={e=>setSearch(e.target.value)}/></label><label>Оценка<select value={rating} onChange={e=>setRating(e.target.value)}><option value="">Все</option>{[1,2,3,4,5].map(n=><option key={n}>{n}</option>)}</select></label><label>Дата<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><label>Ответ<select value={answer} onChange={e=>setAnswer(e.target.value)}><option value="">Все</option><option value="no">Без ответа</option><option value="yes">С ответом</option></select></label></div>
 {notice&&<p role="status">{notice}</p>}<p>Найдено: {filtered.length}</p>
 <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))',gap:24}}><div>{filtered.slice(page*30,(page+1)*30).map(r=><button key={r.id} style={{display:'block',width:'100%',textAlign:'left',padding:16,marginBottom:8}} onClick={()=>setSelected(r.id)}><strong>{r.product_image&&<img src={r.product_image} alt="" width={48} height={48} style={{objectFit:"contain",float:"left",marginRight:12}}/>}{r.product_name} · {r.sku}</strong><br/>{r.rating}/5 · {r.customer_name||'Покупатель ASAYA'} · {new Date(r.review_date).toLocaleDateString('ru-RU')}<br/>{r.body.slice(0,160)||'Только оценка'}<br/>{r.source==='wildberries'?'Wildberries':'ASAYA'} · {r.reply?'С ответом':'Без ответа'}</button>)}<button disabled={page===0} onClick={()=>setPage(p=>p-1)}>Назад</button><button disabled={(page+1)*30>=filtered.length} onClick={()=>setPage(p=>p+1)}>Далее</button></div>
 {detail&&<article><h3>{detail.product_name} · {detail.sku}</h3><p>{detail.customer_name||'Покупатель ASAYA'} · {detail.rating}/5 · {new Date(detail.review_date).toLocaleString('ru-RU')}</p><p>{detail.source==='wildberries'?'Wildberries':'ASAYA'} · {statuses[detail.status]||'Скрыт'}</p><p style={{whiteSpace:'pre-wrap'}}>{detail.body||'Отзыв без комментария'}</p>
 {detail.status!=='published'&&<button disabled={busy} onClick={()=>void act(detail.id,{action:'show'})}>Опубликовать</button>}<button disabled={busy||detail.status==='hidden'} onClick={()=>void act(detail.id,{action:'hide'})}>Скрыть</button>
 <form key={detail.id+detail.reply} onSubmit={e=>{e.preventDefault();void act(detail.id,{action:'reply',reply:new FormData(e.currentTarget).get('reply')});}}><label>Официальный ответ ASAYA<textarea name="reply" defaultValue={detail.reply} maxLength={5000}/></label><button disabled={busy}>Сохранить ответ</button></form></article>}</div></section>;
}
export function ReplenishmentSettings({value,onChange}:{value:Record<string,number>;onChange:(value:Record<string,number>)=>void}){
 const [products,setProducts]=useState<Array<{id:string;name:string;sku:string}>>([]),[error,setError]=useState('');
 useEffect(()=>{void (async()=>{let offset:number|null=0;const result:typeof products=[];while(offset!==null){const page=await request('products?offset='+offset,'GET') as {items:typeof products;nextOffset:number|null};result.push(...page.items);offset=page.nextOffset;}setProducts(result);})().catch(()=>setError('Не удалось загрузить товары для настройки напоминаний.'));},[]);
 return <section><h2>Напоминания о повторной покупке</h2><p>Только в личном кабинете, без SMS, скидок и бонусов.</p>{error&&<p role="alert">{error}</p>}{products.map(p=><label key={p.id}>{p.name} ({p.sku})<select value={value[p.id]??0} onChange={e=>onChange({...value,[p.id]:Number(e.target.value)})}>{[0,30,45,60,90].map(n=><option key={n} value={n}>{n?n+' дней':'Выключено'}</option>)}</select></label>)}</section>;
}
