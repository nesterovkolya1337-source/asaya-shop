'use client';
import {useEffect,useState,type FormEvent} from 'react';
import {AdminStocks} from './admin-stocks';
import {assetPath} from '@/lib/asset-path';
import {AuthClientError} from '@/lib/auth-client';
import {createAnalyticsClient,type AnalyticsReport,type AnalyticsQuery} from '@/lib/analytics-client';
import {analyticsExport} from '@/lib/analytics-export';
import styles from './admin-statistics.module.css';
const api=createAnalyticsClient(assetPath('/api/admin/v1'));
const rub=(n:number|null)=>n===null?'Нет данных':new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',maximumFractionDigits:2}).format(n/100);
const percent=(n:number|null)=>n===null?'—':new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(n)+' %';
const categories={hair:'Волосы',body:'Тело',face:'Лицо',sets:'Наборы',unknown:'Категория неизвестна'};
const chartMetrics={salesMinor:'Оплаченные товары, ₽',orders:'Заказы',units:'Продано, шт.'};
export function AdminStatistics({onExpired,csrf}:{onExpired:()=>void;csrf:string}){
 const [stocks,setStocks]=useState(false);
 return <><div className={styles.buttons} aria-label="Раздел аналитики"><button aria-pressed={!stocks} onClick={()=>setStocks(false)}>Продажи</button><button aria-pressed={stocks} onClick={()=>setStocks(true)}>Остатки</button></div>{stocks?<AdminStocks csrf={csrf} onExpired={onExpired}/>:<SalesStatistics onExpired={onExpired}/>}</>;
}
function SalesStatistics({onExpired}:{onExpired:()=>void}){
 const [mode,setMode]=useState<'store'|'products'>('store'),[query,setQuery]=useState<AnalyticsQuery>({days:'30'}),[attempt,setAttempt]=useState(0);
 const [from,setFrom]=useState(''),[to,setTo]=useState(''),[search,setSearch]=useState(''),[category,setCategory]=useState(''),[inputError,setInputError]=useState('');
 const [data,setData]=useState<AnalyticsReport|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[metric,setMetric]=useState<keyof typeof chartMetrics>('salesMinor');
 const [sort,setSort]=useState<'salesMinor'|'units'|'orders'>('salesMinor');
 useEffect(()=>{let active=true;const load=async()=>{setLoading(true);setError('');
  try{const r=await api.get(query);if(active)setData(r);}
  catch(e){if(active){setData(null);setError(e instanceof Error?e.message:'Не удалось загрузить аналитику');if(e instanceof AuthClientError&&['UNAUTHENTICATED','FORBIDDEN'].includes(e.code))onExpired();}}
  finally{if(active)setLoading(false);}};void load();
  return()=>{active=false;};
 },[query,attempt,onExpired]);
 const preset=(days:'7'|'30'|'90')=>{setInputError('');setQuery({days,search,category});};
 const range=(e:FormEvent)=>{e.preventDefault();const days=(Date.parse(to)-Date.parse(from))/86400000+1;if(!Number.isFinite(days)||days<1||days>366){setInputError('Выберите период от 1 до 366 дней.');return;}setInputError('');setQuery({from,to,search,category});};
 const filter=(e:FormEvent)=>{e.preventDefault();setQuery(q=>({...q,search,category}));};
 const download=(kind:'summary'|'daily'|'products')=>{if(!data||loading)return;const r=analyticsExport(data,kind),url=URL.createObjectURL(new Blob([r.content],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=r.filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);};
 const rows=[...(data?.products??[])].sort((a,b)=>b[sort]-a[sort]||a.sku.localeCompare(b.sku));
 const max=Math.max(1,...(data?.daily.map(d=>d[metric])??[])),s=data?.summary;
 return <section className={styles.section} aria-label="Аналитика магазина"><header className={styles.header}><div><h2>Аналитика</h2><p>Продажи и действия с товарами · московское время</p></div><button disabled={loading} onClick={()=>setAttempt(v=>v+1)}>Обновить</button></header>
 <div className={styles.buttons} aria-label="Режим аналитики"><button aria-pressed={mode==='store'} onClick={()=>setMode('store')}>Весь магазин</button><button aria-pressed={mode==='products'} onClick={()=>setMode('products')}>По товарам</button></div>
 <div className={styles.buttons} aria-label="Период аналитики">{(['7','30','90'] as const).map(days=><button key={days} aria-pressed={query.days===days} onClick={()=>preset(days)}>{days} дней</button>)}</div>
 <form className={styles.filters} onSubmit={range}><label>С даты<input type="date" required value={from} onChange={e=>setFrom(e.target.value)}/></label><label>По дату<input type="date" required value={to} onChange={e=>setTo(e.target.value)}/></label><button>Применить период</button></form>
 <form className={styles.filters} onSubmit={filter}><label>Товар или SKU<input type="search" maxLength={100} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Название или артикул"/></label><label>Категория<select aria-label="Категория" value={category} onChange={e=>setCategory(e.target.value)}><option value="">Все категории</option>{Object.entries(categories).map(([v,label])=><option key={v} value={v}>{label}</option>)}</select></label><button>Показать</button></form>
 {inputError&&<p role="alert">{inputError}</p>}
 {loading?<p role="status">Загружаем аналитику…</p>:error?<p role="alert">{error}</p>:data&&s&&<>
 <p>Период: {data.period.from} — {data.period.to}{data.period.search?` · Поиск: ${data.period.search}`:''}{data.period.category?` · ${categories[data.period.category as keyof typeof categories]}`:''}</p>
 <div className={styles.buttons}><button onClick={()=>download('summary')}>Сводка · CSV</button><button onClick={()=>download('daily')}>По дням · CSV</button><button onClick={()=>download('products')}>Все товары выборки · CSV</button></div>
 {mode==='store'&&<div className={styles.cards}>{[['Оплаченные товары',rub(s.salesMinor)],['Оплаченные заказы',s.paidOrders],['Средний заказ без доставки',rub(s.aovMinor)],['Продано, шт.',s.units],['Всего заказов',s.orders],['Отмены',s.cancelled],['Возвращено / невыкуплено, шт.',s.returnedUnits],['Возврат стоимости товаров',rub(s.returnedMinor)],['Подтверждённые денежные возвраты заказов',rub(data.quality.confirmedRefundMinor)]].map(([label,value])=><article key={label}><p>{label}</p><strong>{value}</strong></article>)}</div>}
 <p className={styles.note}>Продажи — оплаченная стоимость товаров до возвратов, без доставки. Заказы отбираются по дате создания; оплаты и возвраты учитываются по последнему подтверждённому состоянию. Частичный возврат не исключает всю продажу. Денежные возвраты заказов могут включать доставку; при фильтре товара эта сумма относится ко всему выбранному заказу.</p>
 {data.quality.refundAllocationIncomplete&&<p role="status" className={styles.notice}>Для части возвратов нет подтверждённой разбивки по товарам. Их товарная сумма показана как «Нет данных», а не распределена приблизительно.</p>}
 {data.quality.unknownRefundOrders>0&&<p className={styles.notice}>У {data.quality.unknownRefundOrders} заказов есть статус возврата, но нет подтверждённой суммы. Эти суммы не прибавлены к денежным возвратам.</p>}
 {data.quality.unknownCategory&&<p className={styles.note}>Исторические категории, которые не были сохранены в заказе, отмечены как неизвестные.</p>}
 {mode==='store'?<><div className={styles.chart}><div className={styles.buttons}>{Object.entries(chartMetrics).map(([k,v])=><button key={k} aria-pressed={metric===k} onClick={()=>setMetric(k as keyof typeof chartMetrics)}>{v}</button>)}</div><svg viewBox="0 0 720 200" role="img" aria-label={`${chartMetrics[metric]} по дням`}><line x1="0" y1="190" x2="720" y2="190" stroke="#ddd"/>{data.daily.map((d,i)=>{const w=720/data.daily.length,h=d[metric]/max*175;return <rect key={d.date} x={i*w+w*.15} y={190-h} width={w*.7} height={h} fill="#925469"><title>{d.date}: {metric==='salesMinor'?rub(d[metric]):d[metric]}</title></rect>;})}</svg><div className={styles.scale}><span>{data.period.from}</span><span>{data.period.to}</span></div><details><summary>Значения по дням</summary><div className={styles.table}><table><thead><tr><th>Дата</th><th>Заказы</th><th>Оплаченные товары</th><th>Продано, шт.</th></tr></thead><tbody>{data.daily.map(d=><tr key={d.date}><td>{d.date}</td><td>{d.orders}</td><td>{rub(d.salesMinor)}</td><td>{d.units}</td></tr>)}</tbody></table></div></details></div><h3>Популярные товары</h3></>:<h3>Показатели по товарам</h3>}
 <div className={styles.buttons} aria-label="Сортировка товаров">{([['salesMinor','По сумме'],['units','По количеству'],['orders','По заказам']] as const).map(([k,label])=><button key={k} aria-pressed={sort===k} onClick={()=>setSort(k)}>{label}</button>)}</div>
 {!rows.length?<p>За выбранный период данных пока нет.</p>:<div className={styles.table}><table><thead><tr><th>Товар / SKU</th>{mode==='products'&&<><th>Показы</th><th>Просмотры</th><th>CTR</th><th>В корзину</th><th>Доля корзины</th><th>Оформления</th></>}<th>Заказы / оплачено</th><th>Продано, шт.</th><th>Оплаченные товары</th>{mode==='products'&&<><th>Просмотр → оплата</th><th>Отмены</th><th>Возврат, шт.</th><th>Возврат товаров, ₽</th><th>Средняя цена</th></>}</tr></thead><tbody>{(mode==='store'?rows.slice(0,10):rows).map(p=><tr key={p.sku}><td>{p.name}<small className={styles.sku}>{p.sku}</small></td>{mode==='products'&&<><td>{p.impressions}</td><td>{p.opens}</td><td>{percent(p.ctr)}</td><td>{p.adds}</td><td>{percent(p.addRate)}</td><td>{p.checkouts}</td></>}<td>{p.orders} / {p.paidOrders}</td><td>{p.units}</td><td>{rub(p.salesMinor)}</td>{mode==='products'&&<><td>{percent(p.paidConversion)}</td><td>{p.cancelled}</td><td>{p.returnedUnits}</td><td>{rub(p.returnedMinor)}</td><td>{rub(p.averagePriceMinor)}</td></>}</tr>)}</tbody></table></div>}
 <p className={styles.note}>Действия считаются один раз для сочетания анонимной сессии, товара и типа действия за 30 минут, только после согласия на аналитику. CTR = клики по карточке / показы; доля корзины = добавления / просмотры; просмотр → оплата = оплаченные заказы / просмотры за период. Это соотношения показателей, не персональная атрибуция. При нулевом знаменателе — «—».</p>
 <p className={styles.note}>Просмотры не восстанавливаются задним числом. {data.eventCoverageStart?`Первое сохранённое действие: ${new Date(data.eventCoverageStart).toLocaleString('ru-RU',{timeZone:'Europe/Moscow'})}.`:'События посетителей пока не поступали.'} Обновлено: {new Date(data.generatedAt).toLocaleString('ru-RU',{timeZone:'Europe/Moscow'})} МСК.</p>
 </>}
 </section>;
}
