'use client';
import {useEffect,useRef,useState} from 'react';
import Image from 'next/image';
import {assetPath} from '@/lib/asset-path';
import {AuthClientError} from '@/lib/auth-client';
import {createStockClient,type StockReport} from '@/lib/stock-client';
import styles from './admin-statistics.module.css';
const api=createStockClient(assetPath('/api/admin/v1'));
const categories:Record<string,string>={hair:'Волосы',body:'Тело',face:'Лицо',sets:'Наборы'};
const time=(v:string|null|undefined)=>v?new Date(v).toLocaleString('ru-RU',{timeZone:'Europe/Moscow'}):'Ещё не обновлялось';
export function AdminStocks({csrf,onExpired}:{csrf:string;onExpired:()=>void}){
 const [data,setData]=useState<StockReport|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[search,setSearch]=useState(''),[now,setNow]=useState(()=>Date.now());
 const locked=useRef(false),active=useRef(false);
 useEffect(()=>{active.current=true;let live=true;
  void api.get().then(r=>{if(live)setData(r);}).catch(e=>{if(live){setError('Не удалось загрузить остатки. Повторите проверку.');if(e instanceof AuthClientError&&['UNAUTHENTICATED','FORBIDDEN'].includes(e.code))onExpired();}});
  const timer=setInterval(()=>setNow(Date.now()),10000);
  return()=>{live=false;active.current=false;clearInterval(timer);};
 },[onExpired]);
 const refresh=async()=>{
  if(locked.current)return;locked.current=true;setBusy(true);setError('');setNotice('');
  try{const outcome=data?.configured?await api.refresh(csrf):null;if(active.current)setNotice(outcome==='updated'?'Синхронизация завершена.':outcome==='not_due'?'Следующее обновление ещё не разрешено расписанием.':outcome==='in_progress'?'Синхронизация уже выполняется. Повторите проверку немного позже.':'');}
  catch(e){if(active.current){setError('Обновление не удалось. Последние полученные значения сохранены; проверьте время и статус.');if(e instanceof AuthClientError&&['UNAUTHENTICATED','FORBIDDEN'].includes(e.code))onExpired();}}
  finally{try{const report=await api.get();if(active.current){setData(report);setNow(Date.now());}}catch{if(active.current)setError('Не удалось получить текущее состояние. Ниже — последние загруженные данные.');}locked.current=false;if(active.current)setBusy(false);}
 };
 const source=data?.source,status=source?.syncStatus==='fresh'&&(!source.expiresAt||Date.parse(source.expiresAt)<=now)?'stale':source?.syncStatus;
 const statusLabel=status==='fresh'?'Актуально':status==='stale'?'Устарело':status==='error'?'Ошибка обновления':'Нет синхронизации';
 const rows=data?.items.filter(i=>`${i.name} ${i.sku}`.toLocaleLowerCase('ru').includes(search.toLocaleLowerCase('ru')))??[];
 return <section className={styles.section} aria-label="Остатки товаров"><header className={styles.header}><div><h2>Остатки</h2><p>СДЭК Фулфилмент · московское время</p></div><button disabled={busy} onClick={()=>void refresh()}>{busy?'Обновляем…':data?.configured?'Обновить остатки':'Проверить подключение'}</button></header>
 {error&&<p role="alert" className={styles.notice}>{error}</p>}{notice&&<p role="status">{notice}</p>}
 {!data&&!error&&<p role="status">Загружаем остатки…</p>}
 {data&&!data.configured&&<p className={styles.notice}>Источник остатков ещё не подключён к серверу. Количество неизвестно.</p>}
 {source&&<><p>Склад {source.externalWarehouseId} · {source.environment==='test'?'Тестовые данные':'Рабочий источник'} · <strong>{statusLabel}</strong></p>
 <p>Последняя успешная синхронизация: {time(source.syncedAt)}. Выгрузка СДЭК: {time(source.sourceUpdatedAt)}.</p>
 {source.nextAttemptAt&&<p className={styles.note}>Следующая попытка разрешена с {time(source.nextAttemptAt)} МСК. Повторные нажатия не ускоряют расписание.</p>}
 {status==='error'&&<p className={styles.notice}>Не удалось обновить источник. Показаны последние успешно полученные значения.</p>}
 {status==='stale'&&<p className={styles.notice}>Срок свежести данных истёк. Значения требуют обновления.</p>}
 <p className={styles.note}>Количество — из выгрузки СДЭК. Источник не передаёт отдельные значения «доступно» и «резерв». Ручное редактирование остатков здесь недоступно.</p>
 <div className={styles.filters}><label>Товар или SKU<input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Название или артикул"/></label></div>
 {!rows.length?<p>Товары не найдены.</p>:<div className={styles.table}><table><thead><tr><th>Фото</th><th>Товар</th><th>SKU</th><th>Категория</th><th>Остаток / обновлено</th><th>Статус</th></tr></thead><tbody>{rows.map(i=><tr key={i.productId}><td>{i.image?<Image unoptimized src={i.image.startsWith('/')?assetPath(i.image):i.image} alt="" width={48} height={64} style={{objectFit:'contain'}}/>:'—'}</td><td>{i.name}</td><td>{i.sku}</td><td>{categories[i.category??'']??'Не задана'}</td><td><strong>{i.quantity===null?'Нет данных':`${i.quantity} шт.`}</strong><small className={styles.sku}>Получено: {time(source.syncedAt)}</small><small className={styles.sku}>Выгрузка: {time(source.sourceUpdatedAt)}</small></td><td>{i.quantityState==='missing'?'SKU отсутствует в выгрузке':i.quantityState==='not_synced'?'Ещё не синхронизировано':statusLabel}</td></tr>)}</tbody></table></div>}
 </>}
 </section>;
}
