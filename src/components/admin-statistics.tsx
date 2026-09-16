"use client";
import {useEffect,useState} from 'react';
import {assetPath} from '@/lib/asset-path';
import {AuthClientError} from '@/lib/auth-client';
import {createStatisticsClient,type Statistics} from '@/lib/admin-statistics-client';
import {statisticsExport,type StatisticsReport} from '@/lib/statistics-export';
import styles from './admin-statistics.module.css';
const api=createStatisticsClient(assetPath('/api/admin/v1'));
const rubles=(n:number)=>new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',maximumFractionDigits:2}).format(n/100);
const date=(v:string)=>v.slice(8,10)+'.'+v.slice(5,7);
const metrics={salesMinor:'Продажи, ₽',orders:'Заказы',units:'Товары, шт.'};
export function AdminStatistics({onExpired}:{onExpired:()=>void}){
 const [days,setDays]=useState(30),[attempt,setAttempt]=useState(0),[metric,setMetric]=useState<keyof typeof metrics>('salesMinor');
 const [data,setData]=useState<Statistics|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 useEffect(()=>{let active=true;const load=async()=>{setLoading(true);setError('');try{const r=await api.get(days);if(active)setData(r);}catch(e){if(active){setData(null);setError(e instanceof Error?e.message:'Не удалось загрузить статистику');if(e instanceof AuthClientError&&['UNAUTHENTICATED','FORBIDDEN'].includes(e.code))onExpired();}}finally{if(active)setLoading(false);}};void load();return()=>{active=false;};},[days,attempt,onExpired]);
 const max=Math.max(1,...(data?.daily.map(d=>d[metric])??[]));
 const download=(kind:StatisticsReport)=>{
  if(!data||loading||data.days!==days)return;
  const report=statisticsExport(data,kind),url=URL.createObjectURL(new Blob([report.content],{type:'text/csv;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download=report.filename;
  try{document.body.append(link);link.click();}finally{link.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}
 };
 return <section className={styles.section} aria-label="Статистика продаж"><header className={styles.header}><div><h2>Статистика продаж</h2><p>Заказы за выбранный период · московское время</p></div><button onClick={()=>setAttempt(v=>v+1)} disabled={loading}>Обновить статистику</button></header>
 <div className={styles.buttons} aria-label="Период статистики">{[7,30,90].map(n=><button key={n} aria-pressed={days===n} onClick={()=>setDays(n)}>{n} дней</button>)}</div>
 {loading?<p role="status">Загружаем статистику…</p>:error?<p role="alert">{error}</p>:data&&<>
 <div className={styles.buttons} aria-label="Скачать отчёты"><button onClick={()=>download('daily')}>Скачать по дням · CSV</button><button disabled={!data.topProducts.length} onClick={()=>download('top-products')}>Скачать топ-10 товаров · CSV</button></div>
 <p className={styles.note}>Файлы для Excel содержат данные выбранного периода. В выгрузке товаров — до 10 позиций из таблицы ниже.</p>
 <div className={styles.cards}>{[['Продажи товаров',rubles(data.salesMinor)],['Оплаченные заказы',String(data.paidOrders)],['Средний заказ без доставки',rubles(data.paidOrders?Math.round(data.salesMinor/data.paidOrders):0)],['Товаров продано',String(data.units)],['Всего заказов',String(data.orders)],['Отменено',String(data.cancelled)],['С возвратами / отказами',String(data.returned)]].map(([label,value])=><article key={label}><p>{label}</p><strong>{value}</strong></article>)}</div>
 <p className={styles.note}>Продажи, средний заказ и популярные товары учитывают оплаченные заказы без отмен, возвратов и отказов. Заказ с частичным возвратом исключается целиком. Доставка не входит в сумму. Это статистика по дате создания заказа, не отчёт о движении денег.</p>
 {!data.orders&&<p>За выбранный период заказов пока нет.</p>}
 <div className={styles.chart}><div className={styles.buttons} aria-label="Показатель графика">{Object.entries(metrics).map(([key,label])=><button key={key} aria-pressed={metric===key} onClick={()=>setMetric(key as keyof typeof metrics)}>{label}</button>)}</div>
 <div className={styles.scale}><span>{metric==='salesMinor'?rubles(max===1&&data.salesMinor===0?0:max):max}</span><span>по дням</span></div>
 <svg viewBox="0 0 720 200" role="img" aria-label={`${metrics[metric]} по дням. Точные значения в таблице ниже.`}>
 <line x1="0" y1="190" x2="720" y2="190" stroke="#ded8d3" />
 {data.daily.map((d,i)=>{const width=720/data.daily.length,h=d[metric]/max*175;return <rect key={d.date} x={i*width+width*.15} y={190-h} width={width*.7} height={h} rx="2" fill="#925469"><title>{date(d.date)}: {metric==='salesMinor'?rubles(d[metric]):d[metric]}</title></rect>;})}</svg>
 <div className={styles.scale}><span>{date(data.daily[0].date)}</span><span>{date(data.daily.at(-1)!.date)}</span></div>
 <details><summary>Точные значения по дням</summary><div className={styles.table}><table><thead><tr><th>Дата</th><th>Заказы</th><th>Продажи</th><th>Товары</th></tr></thead><tbody>{data.daily.map(d=><tr key={d.date}><td>{date(d.date)}</td><td>{d.orders}</td><td>{rubles(d.salesMinor)}</td><td>{d.units}</td></tr>)}</tbody></table></div></details></div>
 <h3>Популярные товары по сумме продаж</h3>{data.topProducts.length?<div className={styles.table}><table><thead><tr><th>Товар</th><th>Артикул</th><th>Продано, шт.</th><th>Сумма</th></tr></thead><tbody>{data.topProducts.map(p=><tr key={p.sku}><td>{p.name}</td><td>{p.sku}</td><td>{p.units}</td><td>{rubles(p.salesMinor)}</td></tr>)}</tbody></table></div>:<p>Оплаченных продаж без отмен и возвратов пока нет.</p>}
 <p className={styles.note}>Обновлено: {new Date(data.generatedAt).toLocaleString('ru-RU',{timeZone:'Europe/Moscow'})} МСК. Показатели отражают данные базы сайта; события из Яндекса появятся после их получения.</p>
 </>}
 </section>;
}
