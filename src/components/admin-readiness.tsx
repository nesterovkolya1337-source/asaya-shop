"use client";
import {useEffect,useRef,useState} from 'react';
import {assetPath} from '@/lib/asset-path';
import {AuthClientError} from '@/lib/auth-client';
import {createReadinessClient,publicationLabels,deliveryLabels,type Readiness} from '@/lib/admin-readiness-client';
import styles from './server-admin.module.css';
const api=createReadinessClient(assetPath('/api/admin/v1'));
export function AdminReadiness({onExpired}:{onExpired:()=>void}){
 const [offset,setOffset]=useState(0),[revision,setRevision]=useState(0),[data,setData]=useState<Readiness|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const expired=useRef(onExpired);useEffect(()=>{expired.current=onExpired;},[onExpired]);
 useEffect(()=>{let active=true;void api.get(offset).then(r=>{if(active)setData(r);}).catch(e=>{if(active){setData(null);setError('Не удалось проверить карточки. Повторите проверку.');if(e instanceof AuthClientError&&['UNAUTHENTICATED','FORBIDDEN'].includes(e.code))expired.current();}}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[offset,revision]);
 return <section aria-label="Подготовка каталога к запуску"><h3>Подготовка каталога к запуску</h3><p>Проверяем сохранённые карточки. Эта проверка не публикует товары и не подтверждает подключение Яндекса.</p><button disabled={loading} onClick={()=>{setLoading(true);setError('');setOffset(0);setRevision(n=>n+1);}}>Проверить карточки</button>
 {loading?<p role="status">Проверяем данные…</p>:error?<p role="alert">{error}</p>:data&&<>
 <p>Товаров: {data.total}. Опубликовано: {data.publishedCount}.</p>
 {data.catalogOnly&&<p>Сейчас доступно редактирование каталога. Оформление заказов выключено.</p>}
 <p>{data.ycpConfigured?'Настройки Яндекса сохранены на сервере. Проверка подключения в кабинете Яндекса выполняется отдельно.':'Яндекс Чекаут на сервере ещё не подключён.'}</p>
 <p>Хранение и отправка — через СДЭК. Служба доставки подключается в кабинете Яндекс Чекаута. Доступные варианты доставки по России, стоимость и срок покупатель получает при оформлении.</p>
 <p>Первая поставка предварительно планируется в Москву. Это не ограничивает доставку по России.</p>
 <p>Источник остатков и точки отправления проверяется при подключении СДЭК к Яндексу. Для заполнения карточек создавать склады в админке не требуется.</p>
 {!data.items.length?<p>На этой странице товаров нет.</p>:data.items.map(p=><article key={p.id} className={styles.notice}><h4>{p.name||'Без названия'}</h4><p>Артикул: {p.sku} · {p.published?'Опубликован':'Скрыт'}</p>
 <p>{p.publicationIssues.length?'Для публикации: '+p.publicationIssues.map(k=>publicationLabels[k]).join('; '):'Обязательные поля для публикации заполнены.'}</p>
 <p>{p.deliveryIssues.length?'Для передачи заказа: '+p.deliveryIssues.map(k=>deliveryLabels[k]).join('; '):'В системе указаны вес, размеры и доступный остаток.'}</p></article>)}
 <p>Для исправлений откройте «Товары» и найдите карточку по артикулу.</p><div className={styles.actions}>{offset>0&&<button onClick={()=>{setLoading(true);setError('');setOffset(0);}}>К началу</button>}{data.nextOffset!==null&&<button onClick={()=>{setLoading(true);setError('');setOffset(data.nextOffset!);}}>Следующие товары</button>}</div>
 </>}
 </section>;
}
