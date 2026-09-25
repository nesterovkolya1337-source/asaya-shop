
'use client';
import {useEffect,useState,useRef} from 'react';
import {CarouselArrow} from './carousel-arrow';
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
type PublicReview={id:string;rating:number;body:string;reply:string|null;created_at:string;author_display_name:string};
export function ProductReviews({sku,slug}:{sku:string;slug:string}){
 const rail=useRef<HTMLDivElement>(null),loadingMore=useRef(false);
 const [index,setIndex]=useState(0),[moreError,setMoreError]=useState(false),[busyMore,setBusyMore]=useState(false);
 const [nextOffset,setNextOffset]=useState<number|null>(null);
 const [aggregate,setAggregate]=useState<{count:number;average:number|null}>({count:0,average:null});
 const [items,setItems]=useState<PublicReview[]>([]),[status,setStatus]=useState<'loading'|'ready'|'error'>('loading'),[eligible,setEligible]=useState(false);
 useEffect(()=>{let active=true;setItems([]);setIndex(0);setMoreError(false);setStatus('loading');setEligible(false);rail.current?.scrollTo({left:0});
 void request('reviews/'+encodeURIComponent(sku),'GET').then(v=>{if(active){setItems((v as {items:PublicReview[]}).items);setNextOffset((v as {nextOffset:number|null}).nextOffset);setAggregate((v as {aggregate:{count:number;average:number|null}}).aggregate);setStatus('ready');}}).catch(()=>{if(active)setStatus('error');});
 // Existing authenticated endpoint is authoritative for verified-purchase eligibility.
 void request('account/engagement','GET').then(v=>{if(active)setEligible((v as Data).products.some(p=>p.slug===slug&&!p.reviewed));}).catch(()=>{});
 return ()=>{active=false;};},[sku,slug]);
 async function next(){
  if(index<items.length-1){rail.current?.scrollTo({left:(index+1)*rail.current.clientWidth,behavior:'smooth'});return;}
  if(nextOffset===null||loadingMore.current)return;
  loadingMore.current=true;setBusyMore(true);setMoreError(false);
  try{const v=await request('reviews/'+encodeURIComponent(sku)+'?offset='+nextOffset,'GET') as {items:PublicReview[];nextOffset:number|null};setItems(items=>[...items,...v.items]);setNextOffset(v.nextOffset);
   requestAnimationFrame(()=>rail.current?.scrollTo({left:(index+1)*rail.current.clientWidth,behavior:'smooth'}));
  }catch{setMoreError(true);}finally{loadingMore.current=false;setBusyMore(false);}
 }
 const average=aggregate.average??0;
 return <section className={reviewStyles.section} aria-label="Отзывы" data-product-reviews>
  <header className={reviewStyles.heading}><div><h2>Отзывы</h2>{aggregate.count>0&&<div className={reviewStyles.aggregate}><strong>{average.toLocaleString('ru-RU',{maximumFractionDigits:1})}</strong><span aria-label={`Средняя оценка ${average.toFixed(1)} из 5`}>{'★'.repeat(Math.round(average))}{'☆'.repeat(5-Math.round(average))}</span><span>На основе {aggregate.count} отзывов</span></div>}</div>{eligible&&<a className={reviewStyles.action} href={assetPath('/account/#reviews')}>Оставить отзыв</a>}</header>
  {status!=='ready'?<p className={reviewStyles.empty} role="status">{status==='loading'?'Загружаем отзывы…':'Не удалось загрузить отзывы. Попробуйте обновить страницу.'}</p>:!items.length?<div className={reviewStyles.empty}><h3>Отзывов пока нет</h3><p>☆☆☆☆☆ · 0 отзывов</p><p>Здесь появятся впечатления покупателей об этом товаре.</p></div>:<>
   <div className={reviewStyles.list} ref={rail} tabIndex={0} aria-label="Карусель отзывов" onScroll={e=>setIndex(Math.round(e.currentTarget.scrollLeft/e.currentTarget.clientWidth))}>
    {items.map((r,i)=><article key={r.id} className={reviewStyles.card} aria-label={`Отзыв ${i+1} из ${aggregate.count}`}><div className={reviewStyles.meta}><h3>Покупатель</h3><strong>{r.author_display_name}</strong>{r.created_at&&<time dateTime={r.created_at}>{new Date(r.created_at).toLocaleDateString('ru-RU')}</time>}</div><div className={reviewStyles.reviewContent}><p className={reviewStyles.stars} aria-label={`Оценка ${r.rating} из 5`}>{'★'.repeat(r.rating)}{'☆'.repeat(5-r.rating)}</p><h3>Достоинства</h3>{r.body&&<p className={reviewStyles.body}>{r.body}</p>}<h3>Недостатки</h3><p className={reviewStyles.body}>Нет</p>{r.reply&&<div className={reviewStyles.reply}><strong>Ответ ASAYA</strong><p>{r.reply}</p></div>}</div></article>)}
   </div>
   <div className={reviewStyles.controls}><button type="button" aria-label="Предыдущий отзыв" disabled={index===0} onClick={()=>rail.current?.scrollTo({left:(index-1)*rail.current.clientWidth,behavior:'smooth'})}><CarouselArrow previous/></button><span aria-live="polite">{index+1} / {aggregate.count}</span><button type="button" aria-label="Следующий отзыв" disabled={busyMore||(index>=items.length-1&&nextOffset===null)} onClick={()=>void next()}><CarouselArrow/></button></div>
   {moreError&&<p role="status">Не удалось загрузить следующий отзыв. Нажмите стрелку ещё раз.</p>}
  </>}
 </section>;
}
