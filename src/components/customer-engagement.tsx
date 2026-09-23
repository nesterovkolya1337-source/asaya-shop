
'use client';
import {useEffect,useState} from 'react';
import {assetPath} from '@/lib/asset-path';
import {createStoreRequest,AuthClientError,type ServerSession} from '@/lib/auth-client';
import styles from './customer-dashboard.module.css';
import reviewStyles from './product-reviews.module.css';
const request=createStoreRequest(assetPath('/api/store/v1'),fetch);
type Product={id:string;name:string;slug:string|null;reviewed:boolean};
type Data={code:string;products:Product[];reminders:Product[]};
export function CustomerEngagement({session,onExpired,section,onReminders}:{session:ServerSession;onExpired:()=>void;section:"reviews"|"referral"|"reminders"|null;onReminders:(value:boolean)=>void}){
 const [data,setData]=useState<Data|null>(null),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const load=()=>request('account/engagement','GET').then(v=>{setData(v as Data);onReminders((v as Data).reminders.length>0);});
 function fail(e:unknown){if(e instanceof AuthClientError&&e.code==='UNAUTHENTICATED')onExpired();setNotice(e instanceof Error?e.message:'Не удалось выполнить действие.');}
 useEffect(()=>{void (async()=>{const code=new URLSearchParams(window.location.search).get('ref');if(code){try{await request('account/referral','POST',{code},session.csrfToken);}catch(e){fail(e);}}await load();})().catch(fail);},[session.csrfToken]);
 async function review(e:React.FormEvent<HTMLFormElement>,productId:string){e.preventDefault();const f=new FormData(e.currentTarget);setBusy(true);try{await request('account/reviews','POST',{productId,rating:Number(f.get('rating')),body:String(f.get('body'))},session.csrfToken);setNotice('Отзыв отправлен на модерацию. За первый валидный отзыв начислим 100 баллов независимо от оценки.');await load();}catch(e){fail(e);}finally{setBusy(false);}}
 if(!section)return null;
 return <section className={styles.panel} aria-label={section==='reviews'?'Отзывы о покупках':section==='referral'?'Пригласи друга':'Повторная покупка'}>
 {notice&&<p role="status">{notice}</p>}{!data&&!notice&&<p role="status">Загружаем…</p>}{data&&<>
 {section==='referral'&&<><h2>Пригласи друга</h2><div className={styles.rewardCard}><strong>200 <small>баллов</small></strong><p>За первую оплаченную покупку друга по вашей ссылке.</p></div><label className={styles.referralLink}>Ваша ссылка<input readOnly onFocus={e=>e.target.select()} value={window.location.origin+assetPath('/account/')+'?ref='+data.code}/></label><p className={styles.secondary}>Код приглашения: <strong>{data.code}</strong></p></>}
 {section==='reminders'&&<><h2>Пора пополнить запас</h2><div className={styles.engagementList}>{data.reminders.map(p=><article key={p.id}><h3>{p.name}</h3>{p.slug&&<a href={assetPath('/product/'+p.slug+'/')}>К товару →</a>}</article>)}</div></>}
 {section==='reviews'&&<><h2>Отзывы о покупках</h2>{!data.products.length&&<p>Здесь появятся товары из ваших покупок.</p>}<div className={styles.engagementList}>{data.products.map(p=>p.reviewed?<article key={p.id}><h3>{p.name}</h3><p className={styles.secondary}>Отзыв отправлен</p></article>:<form key={p.id} onSubmit={e=>void review(e,p.id)}><h3>{p.name}</h3><label>Оценка<select name="rating" defaultValue="5">{[1,2,3,4,5].map(n=><option key={n} value={n}>{n} из 5</option>)}</select></label><label>Ваш отзыв<textarea name="body" required minLength={3} maxLength={5000}/></label><button disabled={busy}>Отправить отзыв</button></form>)}</div></>}
 </>}</section>;

}
type PublicReview={id:string;rating:number;body:string;reply:string|null;created_at:string};
export function ProductReviews({sku,slug}:{sku:string;slug:string}){
 const [items,setItems]=useState<PublicReview[]>([]),[status,setStatus]=useState<'loading'|'ready'|'error'>('loading'),[eligible,setEligible]=useState(false);
 useEffect(()=>{let active=true;setItems([]);setStatus('loading');setEligible(false);
 void request('reviews/'+encodeURIComponent(sku),'GET').then(v=>{if(active){setItems((v as {items:PublicReview[]}).items);setStatus('ready');}}).catch(()=>{if(active)setStatus('error');});
 // Existing authenticated endpoint is authoritative for verified-purchase eligibility.
 void request('account/engagement','GET').then(v=>{if(active)setEligible((v as Data).products.some(p=>p.slug===slug&&!p.reviewed));}).catch(()=>{});
 return ()=>{active=false;};},[sku,slug]);
 const average=items.length?items.reduce((sum,r)=>sum+r.rating,0)/items.length:0;
 return <section className={reviewStyles.section} aria-label="Отзывы покупателей" data-product-reviews>
  <header className={reviewStyles.heading}><div><h2>Отзывы покупателей</h2>{items.length>0&&<p><strong>{average.toLocaleString('ru-RU',{maximumFractionDigits:1})} / 5</strong> · Отзывов: {items.length}</p>}</div>{eligible&&<a className={reviewStyles.action} href={assetPath('/account/#reviews')}>Оставить отзыв</a>}</header>
  {status!=='ready'?<p className={reviewStyles.empty} role="status">{status==='loading'?'Загружаем отзывы…':'Не удалось загрузить отзывы. Попробуйте обновить страницу.'}</p>:!items.length?<div className={reviewStyles.empty}><h3>Отзывов пока нет</h3><p>Здесь появятся впечатления покупателей об этом товаре.</p></div>:<div className={reviewStyles.list}>{items.map(r=><article key={r.id} className={reviewStyles.card}><div className={reviewStyles.meta}><strong>Покупатель ASAYA</strong>{r.created_at&&<time dateTime={r.created_at}>{new Date(r.created_at).toLocaleDateString('ru-RU')}</time>}</div><p className={reviewStyles.stars} aria-label={`Оценка ${r.rating} из 5`}>{'★'.repeat(r.rating)}{'☆'.repeat(5-r.rating)}</p><p className={reviewStyles.body}>{r.body}</p>{r.reply&&<div className={reviewStyles.reply}><strong>Ответ ASAYA</strong><p>{r.reply}</p></div>}</article>)}</div>}
 </section>;
}
