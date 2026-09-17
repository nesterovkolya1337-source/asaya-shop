"use client";
import Link from 'next/link';
import {useEffect,useRef,useState,useCallback,type FormEvent} from 'react';
import {assetPath} from '@/lib/asset-path';
import {defaultProducts} from '@/lib/store-data';
import {AuthClientError} from '@/lib/auth-client';
import {createAdminClient,adminError,type StaffSession,type AdminDraft,type AdminProduct,type ProductRow} from '@/lib/admin-client';
import type {ProductContent} from '@/lib/backend-catalog';
import {useShop} from './shop-provider';
import {AdminMediaEditor} from './admin-media-editor';
import {AdminOrders} from './admin-orders';
import {AdminIntegration} from './admin-integration';
import {AdminStatistics} from './admin-statistics';
import styles from './server-admin.module.css';
import shell from './admin-shell.module.css';
import {AdminSiteEditor} from './admin-site-editor';
const api=createAdminClient(assetPath('/api/admin/v1'));
const blankContent:ProductContent={description:'',volume:'',category:'hair',setKind:'none',usage:'',ingredients:'',aroma:'',features:[],image:'',gallery:[],badge:'',instruction:{steps:[],amount:'',tip:''},safety:'',recommendations:[],sensory:[]};
const blankDraft:AdminDraft={sku:'',name:'',slug:'',content:blankContent,regularMinor:null,finalMinor:null,weightG:null,widthMm:null,heightMm:null,depthMm:null};
function initialDraft(p:AdminProduct):AdminDraft {
 const legacy=!p.hasDraft&&defaultProducts.find(d=>d.id===p.draft.slug);
 if(!legacy)return p.draft;
 const {description,volume,category,usage,ingredients,aroma,features,image,gallery,badge,instruction,recommendations,sensory}=legacy;
 const prefix=process.env.NEXT_PUBLIC_BASE_PATH??'';
 const storedImage=(v:string)=>prefix&&v.startsWith(prefix+'/images/')?v.slice(prefix.length):v;
 return {...p.draft,content:{description,volume,category,usage,ingredients,aroma,features,image:storedImage(image),gallery:gallery.map(storedImage),badge,instruction,recommendations,sensory,safety:'',setKind:'none'}};
}
function PriceField({label,value,onChange}:{label:string;value:number|null;onChange:(n:number|null)=>void}){
 const [raw,setRaw]=useState(value===null?'':(value/100).toFixed(2));
 return <label>{label}<input inputMode="decimal" value={raw} onChange={e=>{const v=e.target.value;if(/^\d*(?:[.,]\d{0,2})?$/.test(v)){setRaw(v);onChange(v===''||v==='.'||v===','?null:Math.round(Number(v.replace(',','.'))*100));}}}/></label>;
}
export function ServerAdmin(){
 const [section,setSection]=useState<'content'|'catalog'|'orders'|'statistics'|'integration'>('content');
 const [contentDirty,setContentDirty]=useState(false),[logoutConfirm,setLogoutConfirm]=useState(false);
 const [selectedOrder,setSelectedOrder]=useState<string|undefined>();
 const [session,setSession]=useState<StaffSession|null>(null),[checking,setChecking]=useState(true),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const onExpired=useCallback(()=>{setSession(null);setNotice('Сессия завершилась. Войдите снова.');},[]);
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[code,setCode]=useState('');
 const pending=useRef(false),authEpoch=useRef(0);
 useEffect(()=>{
  let active=true;
  const check=async()=>{if(pending.current)return;const epoch=++authEpoch.current;try{const s=await api.me();if(active&&epoch===authEpoch.current){setSession(s);setNotice('');}}catch(e){if(active&&epoch===authEpoch.current)setNotice(adminError(e));}finally{if(active&&epoch===authEpoch.current)setChecking(false);}};
  void check();window.addEventListener('focus',check);
  return()=>{active=false;window.removeEventListener('focus',check);};
 },[]);
 async function login(e:FormEvent){e.preventDefault();if(pending.current)return;pending.current=true;authEpoch.current++;setBusy(true);setNotice('');
  try{setSession(await api.login(email,password,code));setPassword('');setCode('');}catch(e){setNotice(adminError(e));setCode('');}finally{pending.current=false;setBusy(false);}}
 async function logout(){if(!session||pending.current)return;pending.current=true;authEpoch.current++;setBusy(true);
  try{await api.logout(session.csrfToken);setSession(null);setNotice('');}catch(e){setNotice(adminError(e));}finally{pending.current=false;setBusy(false);}}
 return <div className={shell.shell}>
 <header className={shell.header}><div className={shell.brand}><strong>ASAYA</strong><small>Управление магазином</small></div>
 {session&&<nav className={shell.nav} aria-label="Разделы админки">{([['content','Редактор сайта'],['catalog','Товары'],['orders','Заказы'],['statistics','Аналитика'],['integration','Настройки']] as const).map(([key,label])=><button key={key} aria-current={section===key?'page':undefined} onClick={()=>setSection(key)}>{label}{key==='content'&&contentDirty?' •':''}</button>)}</nav>}
 <div className={shell.headerActions}><Link href="/">Открыть сайт ↗</Link>{session&&<button disabled={busy} onClick={()=>contentDirty?setLogoutConfirm(true):void logout()}>Выйти</button>}</div></header>
 {process.env.NEXT_PUBLIC_EDITOR_PREVIEW==='true'&&<p className={shell.notice}>Предпросмотр редактора · тестовые данные на этом компьютере. Изменения не затрагивают сайт ASAYA.</p>}
 {notice&&<p role="alert" className={shell.notice}>{notice}</p>}
 {logoutConfirm&&<div role="alert" className={shell.notice}><p>В редакторе сайта есть несохранённые правки. Выйти без сохранения?</p><button disabled={busy} onClick={()=>{setLogoutConfirm(false);void logout();}}>Выйти без сохранения</button><button onClick={()=>{setLogoutConfirm(false);setSection('content');}}>Вернуться к редактору</button></div>}
 <main>{checking?<p className={shell.checking}>Проверяем доступ…</p>:session?<>
 <div hidden={section!=='content'}><AdminSiteEditor key={session.user.id} session={session} onExpired={onExpired} onDirty={setContentDirty}/></div>
 <div className={styles.main} hidden={section==='content'}>
 <div hidden={section!=='catalog'}><h1>Товары</h1><CatalogEditor key={session.user.id} session={session} onExpired={onExpired}/></div>
 {section==='integration'&&<AdminIntegration onExpired={onExpired} onOrder={id=>{setSelectedOrder(id);setSection('orders');}}/>}
 {section==='statistics'&&<AdminStatistics onExpired={onExpired}/>}
 {section==='orders'&&<AdminOrders key={selectedOrder} initialOrderId={selectedOrder} session={session} onExpired={onExpired}/>}
 </div></>:<div className={styles.main}><form className={styles.login} onSubmit={login}><h1>Вход в кабинет</h1><p>Управляйте страницами, товарами и заказами ASAYA.</p><fieldset disabled={busy}>
 <label>Почта сотрудника<input type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)}/></label>
 <label>Пароль<input type="password" autoComplete="current-password" required maxLength={256} value={password} onChange={e=>setPassword(e.target.value)}/></label>
 <label>Код из приложения-аутентификатора<input inputMode="numeric" autoComplete="one-time-code" required pattern="[0-9]{6}" maxLength={6} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,''))}/></label>
 <button className={styles.primary}>Войти</button></fieldset></form></div>}</main></div>;
}
function CatalogEditor({session,onExpired}:{session:StaffSession;onExpired:()=>void}){
 const {reloadCatalog}=useShop();
 const [rows,setRows]=useState<ProductRow[]>([]),[search,setSearch]=useState(''),[next,setNext]=useState<number|null>(null);
 const [product,setProduct]=useState<AdminProduct|null>(null),[draft,setDraft]=useState<AdminDraft>(blankDraft),[dirty,setDirty]=useState(false);
 const [operationBusy,setBusy]=useState(false),[mediaBusy,setMediaBusy]=useState(false),[notice,setNotice]=useState(''),[confirm,setConfirm]=useState<'publish'|'unpublish'|'discard'|null>(null);
 const busy=operationBusy||mediaBusy;
 const [history,setHistory]=useState<Array<{action:string;createdAt:string;actorId:string}>>([]);
 const lock=useRef(false),nextAction=useRef<(()=>Promise<void>)|null>(null);
 useEffect(()=>{if(!dirty)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
 async function run(action:()=>Promise<void>){
  if(lock.current||mediaBusy)return;lock.current=true;setBusy(true);setNotice('');
  try{await action();}catch(e){setNotice(adminError(e));if(e instanceof AuthClientError&&e.code==='UNAUTHENTICATED')onExpired();}
  finally{lock.current=false;setBusy(false);}
 }
 useEffect(()=>{
  let active=true;
  api.list().then(r=>{if(active){setRows(r.items);setNext(r.nextOffset);}}).catch(e=>{if(active)setNotice(adminError(e));});
  return()=>{active=false;};
 },[]);
 async function list(offset=0){const r=await api.list(search,offset);setRows(previous=>offset?[...previous,...r.items]:r.items);setNext(r.nextOffset);}
 async function open(id:string){
  const p=await api.detail(id);setProduct(p);setDraft(initialDraft(p));setDirty(false);setConfirm(null);
  setHistory((await api.history(id)));
 }
 function choose(action:()=>Promise<void>){
  if(dirty){nextAction.current=action;setConfirm('discard');return;}
  void run(action);
 }
 function newProduct(){
  choose(async()=>{setProduct({id:crypto.randomUUID(),revision:0,active:false,hasDraft:false,publishedAt:null,draft:blankDraft,stocks:[]});setDraft(structuredClone(blankDraft));setDirty(false);setHistory([]);setConfirm(null);});
 }
 function change(value:Partial<AdminDraft>){setDraft(d=>({...d,...value}));setDirty(true);setConfirm(null);}
 function content(value:Partial<ProductContent>){change({content:{...draft.content,...value}});}
 async function save(e:FormEvent){
  e.preventDefault();if(!product)return;
  await run(async()=>{
   const cleaned={...draft,content:{...draft.content,features:draft.content.features.filter(v=>v.trim()),gallery:draft.content.gallery.filter(v=>v.trim()),recommendations:draft.content.recommendations.filter(v=>v.trim()),instruction:{...draft.content.instruction,steps:draft.content.instruction.steps.filter(v=>v.trim())}}};
   await api.save(product.id,cleaned,product.revision,session.csrfToken);await open(product.id);await list();setNotice('Черновик сохранён. На витрине изменения появятся после публикации.');
  });
 }
 async function publication(){
  if(!product)return;const operation=confirm;
  await run(async()=>{if(operation==='publish')await api.publish(product.id,product.revision,session.csrfToken);else await api.unpublish(product.id,product.revision,session.csrfToken);
   await open(product.id);await list();reloadCatalog();setNotice(operation==='publish'?'Товар опубликован.':'Товар скрыт с витрины. Заказы и история сохранены.');});
 }
 const labels:Record<string,string>={'product.draft_saved':'Сохранён черновик','product.published':'Опубликован товар','product.unpublished':'Товар скрыт','inventory.adjusted':'Изменён остаток'};
 const textField=(label:string,key:'name'|'slug')=><label>{label}<input value={draft[key]} maxLength={key==='slug'?80:300} onChange={e=>change({[key]:e.target.value})}/></label>;
 const contentField=(label:string,key:'description'|'volume'|'usage'|'ingredients'|'aroma'|'image'|'safety',large=false)=><label>{label}{large?<textarea rows={4} value={draft.content[key]} onChange={e=>content({[key]:e.target.value})}/>:<input value={draft.content[key]} onChange={e=>content({[key]:e.target.value})}/>}</label>;
 const lines=(label:string,key:'features'|'gallery'|'recommendations')=><label>{label}<textarea rows={3} value={draft.content[key].join('\n')} onChange={e=>content({[key]:e.target.value.split('\n')})}/></label>;
 return <><p>Сначала сохраните черновик, затем опубликуйте. Остатки меняются отдельно и сразу.</p>
 {notice&&<p role="status" className={styles.notice}>{notice}</p>}
 {confirm==='discard'&&<div className={styles.notice}><p>Есть несохранённые правки. Отбросить их и продолжить?</p><button disabled={busy} onClick={()=>{setConfirm(null);void run(nextAction.current!);}}>Отбросить правки</button><button onClick={()=>setConfirm(null)}>Остаться</button></div>}
 <div className={styles.layout}><aside className={styles.sidebar}><form onSubmit={e=>{e.preventDefault();void run(()=>list());}}><label>Найти товар<input value={search} onChange={e=>setSearch(e.target.value)}/></label><button disabled={busy}>Найти</button></form>
 <button className={styles.primary} disabled={busy} onClick={newProduct}>Добавить товар</button>
 <ul>{rows.map(row=><li key={row.id}><button disabled={busy} aria-current={product?.id===row.id?'true':undefined} onClick={()=>choose(()=>open(row.id))}><strong>{row.name||'Без названия'}</strong><span>{row.sku} · {row.active?'На витрине':'Скрыт'}</span></button></li>)}</ul>
 {!rows.length&&<p>Товары не найдены.</p>}{next!==null&&<button disabled={busy} onClick={()=>void run(()=>list(next))}>Показать ещё</button>}</aside>
 <section className={styles.editor}>{!product?<p>Выберите товар или добавьте новый.</p>:<><header><h2>{draft.name||'Новый товар'}</h2><p>{product.active?'Опубликован':'Скрыт с витрины'} · {dirty?'Есть несохранённые правки':product.hasDraft?'Правки сохранены':'Черновик ещё не сохранён'}</p>
 <div className={styles.actions}><button disabled={busy||!product.hasDraft||dirty} onClick={()=>setConfirm('publish')}>Опубликовать</button><button disabled={busy||dirty||!product.active} onClick={()=>setConfirm('unpublish')}>Скрыть с витрины</button>
 {product.revision>0&&<button disabled={busy} onClick={()=>choose(()=>open(product.id))}>Загрузить с сервера</button>}
 {product.active&&<Link href={'/product/'+product.draft.slug}>Посмотреть товар</Link>}</div></header>
 {(confirm==='publish'||confirm==='unpublish')&&<div className={styles.notice}><p>{confirm==='publish'?'Опубликовать сохранённые данные и цены?':'Скрыть товар с витрины? Существующие заказы сохранятся.'}</p><button disabled={busy} onClick={()=>void publication()}>Подтвердить</button><button disabled={busy} onClick={()=>setConfirm(null)}>Назад</button></div>}
 <form onSubmit={save} key={product.id+':'+product.revision}><fieldset disabled={busy}>
 <h3>Основная информация</h3><p>Артикул можно исправить у скрытого товара до использования в заказах и интеграциях. Для опубликованного товара сначала нажмите «Снять с публикации».</p><label>Артикул<input required maxLength={100} readOnly={product.active} value={draft.sku} onChange={e=>change({sku:e.target.value})}/></label>
 {textField('Название','name')}{textField('Адрес карточки: латинские буквы, цифры и дефисы','slug')}
 <div className={styles.columns}><label>Категория<select value={draft.content.category} onChange={e=>content({category:e.target.value as ProductContent['category']})}><option value="hair">Волосы</option><option value="body">Тело</option><option value="face">Лицо</option><option value="sets">Наборы</option></select></label>
 <label>Тип товара<select value={draft.content.setKind} onChange={e=>content({setKind:e.target.value as ProductContent['setKind']})}><option value="none">Отдельный товар</option><option value="combo">Комбо-набор</option><option value="gift">Подарочный набор</option></select></label></div>
 {contentField('Описание','description',true)}{contentField('Объём / размер','volume')}{lines('Особенности — по одной на строке','features')}
 {contentField('Применение','usage',true)}{contentField('Состав','ingredients',true)}{contentField('Аромат','aroma',true)}
 <h3>Фотографии</h3>
 <AdminMediaEditor image={draft.content.image} gallery={draft.content.gallery} csrf={session.csrfToken} disabled={operationBusy} onBusy={setMediaBusy} onExpired={onExpired}
 onUploaded={(url,target)=>{setDraft(d=>({...d,content:{...d.content,...(target==='main'?{image:url}:{gallery:[...d.content.gallery.filter(Boolean),url].slice(0,12)})}}));setDirty(true);setConfirm(null);}}
 onMain={image=>content({image})} onGallery={gallery=>content({gallery})}/>
 <details><summary>Фото по ссылке</summary><p>Можно использовать HTTPS-ссылку или путь к изображению сайта.</p>{contentField('Основное фото — ссылка','image')}{lines('Галерея — по одной ссылке на строке','gallery')}</details>
 <h3>Цена</h3><div className={styles.columns}><PriceField label="Обычная цена, ₽" value={draft.regularMinor} onChange={v=>change({regularMinor:v})}/><PriceField label="Цена продажи, ₽" value={draft.finalMinor} onChange={v=>change({finalMinor:v})}/></div>
 <fieldset><legend>Размещение на сайте</legend><p>Меньшее число — ближе к началу. Категория определяет раздел каталога. Подборки на главной включаются отдельно от метки на карточке.</p>
 <label>Порядок в каталоге<input type="number" min={0} max={100000} required value={draft.content.placement?.catalogOrder??0} onChange={e=>content({placement:{catalogOrder:Number(e.target.value),bestsellerOrder:draft.content.placement?draft.content.placement.bestsellerOrder:(draft.content.badge==='Бестселлер'?0:null),newOrder:draft.content.placement?draft.content.placement.newOrder:(draft.content.badge==='Новинка'?0:null)}})}/></label>
 {(['bestsellerOrder','newOrder'] as const).map((key,index)=>{const p=draft.content.placement??{catalogOrder:0,bestsellerOrder:draft.content.badge==='Бестселлер'?0:null,newOrder:draft.content.badge==='Новинка'?0:null};return <div key={key}><label><input type="checkbox" checked={p[key]!==null} onChange={e=>content({placement:{...p,[key]:e.target.checked?0:null}})}/>{index===0?'Показывать в бестселлерах':'Показывать в новинках'}</label>{p[key]!==null&&<label>Позиция в подборке<input type="number" min={0} max={100000} required value={p[key]!} onChange={e=>content({placement:{...p,[key]:Number(e.target.value)}})}/></label>}</div>;})}</fieldset>
 <label>Метка<select value={draft.content.badge} onChange={e=>content({badge:e.target.value})}>{['','Бестселлер','Новинка','Выбор ASAYA','Лимитированная серия'].map(v=><option key={v} value={v}>{v||'Без метки'}</option>)}</select></label>
 <h3>Инструкция</h3><label>Шаги — по одному на строке<textarea rows={4} value={draft.content.instruction.steps.join('\n')} onChange={e=>content({instruction:{...draft.content.instruction,steps:e.target.value.split('\n')}})}/></label>
 <label>Количество средства<textarea value={draft.content.instruction.amount} onChange={e=>content({instruction:{...draft.content.instruction,amount:e.target.value}})}/></label>
 <label>Совет<textarea value={draft.content.instruction.tip} onChange={e=>content({instruction:{...draft.content.instruction,tip:e.target.value}})}/></label>
 {contentField('Указания и предостережения с упаковки','safety',true)}
 {lines('Адреса рекомендуемых карточек — по одному на строке','recommendations')}
 <h3>Оценки свойств</h3>{draft.content.sensory.map((v,i)=><div className={styles.columns} key={i}><label>Свойство<input value={v.label} onChange={e=>content({sensory:draft.content.sensory.map((x,n)=>n===i?{...x,label:e.target.value}:x)})}/></label><label>Оценка от 0 до 5<input type="number" min={0} max={5} value={v.value} onChange={e=>content({sensory:draft.content.sensory.map((x,n)=>n===i?{...x,value:Number(e.target.value)}:x)})}/></label><button type="button" onClick={()=>content({sensory:draft.content.sensory.filter((_,n)=>n!==i)})}>Убрать свойство</button></div>)}
 <button type="button" disabled={draft.content.sensory.length>=10} onClick={()=>content({sensory:[...draft.content.sensory,{label:'',value:0}]})}>Добавить свойство</button>
 <h3>Параметры отправки</h3><div className={styles.columns}>{([['Вес, г','weightG'],['Ширина, мм','widthMm'],['Высота, мм','heightMm'],['Глубина, мм','depthMm']] as const).map(([label,key])=><label key={key}>{label}<input type="number" min={1} value={draft[key]??''} onChange={e=>change({[key]:e.target.value===''?null:Number(e.target.value)})}/></label>)}</div>
 <button className={styles.primary}>Сохранить черновик</button></fieldset></form>
 {product.hasDraft&&<section><h3>Остатки по складам</h3><p>Для подключённого склада остаток обновляется из СДЭК Фулфилмента. Ручная корректировка доступна только для складов без синхронизации.</p>{!product.stocks.length&&<p>Склады ещё не заведены на сервере.</p>}
 {product.stocks.map(s=>s.source?<div className={styles.stock} key={s.warehouseId}><p>{s.name} · доступно {s.source.available} · в резерве {s.reserved}<br/>Источник: СДЭК Фулфилмент · остаток в выгрузке {s.source.reportedQuantity}<br/>Выгрузка: {new Date(s.source.generatedAt).toLocaleString("ru-RU")}<br/>{s.source.healthy&&Date.parse(s.source.expiresAt)>Date.now()?"Синхронизация работает":"Данные устарели или обновление не удалось. Продажа недоступна."}</p></div>:<form className={styles.stock} key={s.warehouseId+':'+s.onHand+':'+s.reserved} onSubmit={e=>{e.preventDefault();const onHand=Number(new FormData(e.currentTarget).get('onHand'));void run(async()=>{await api.stock(product.id,{warehouseId:s.warehouseId,expectedOnHand:s.onHand,onHand},session.csrfToken);const updated=await api.detail(product.id);setProduct(p=>p?{...p,stocks:updated.stocks}:p);setHistory(await api.history(product.id));reloadCatalog();setNotice('Остаток обновлён.');});}}><label>{s.name} · в резерве {s.reserved}<input type="number" name="onHand" required min={s.reserved} max={1000000} defaultValue={s.onHand}/></label><button disabled={busy||!s.active}>Обновить остаток</button></form>)}</section>}
 <section><h3>Последние действия</h3><ul className={styles.history}>{history.map((h,i)=><li key={i}>{new Date(h.createdAt).toLocaleString('ru-RU')} — {labels[h.action]??h.action}<small>Сотрудник: {h.actorId}</small></li>)}</ul></section></>}</section></div></>;
}
