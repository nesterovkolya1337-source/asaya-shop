"use client";
import Link from 'next/link';
import Image from 'next/image';
import {useEffect,useRef,useState,useCallback,type FormEvent} from 'react';
import {assetPath} from '@/lib/asset-path';
import {defaultProducts} from '@/lib/store-data';
import {AuthClientError} from '@/lib/auth-client';
import {createAdminClient,adminError,type StaffSession,type AdminDraft,type AdminProduct,type ProductRow} from '@/lib/admin-client';
import type {ProductContent} from '@/lib/backend-catalog';
import {useShop} from './shop-provider';
import {AdminBanner,AdminTestStock} from './admin-storefront-controls';
import {AdminPdpEditor} from './admin-pdp-editor';
import {AdminMediaEditor} from './admin-media-editor';
import {AdminOrders} from './admin-orders';
import {AdminEmployees,StaffActivation} from './admin-employees';
import {AdminIntegration} from './admin-integration';
import {AdminStatistics} from './admin-analytics';
import styles from './server-admin.module.css';
import shell from './admin-shell.module.css';
import {publicationIssues,publicationLabels} from '../../backend/src/publication-issues';
const lifecycleLabels={draft:'Черновик',published:'Опубликован',unpublished:'Снят с публикации',deleted:'Удалён'};
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
 const [section,setSection]=useState<'content'|'catalog'|'orders'|'statistics'|'integration'|'employees'>('content');
 const [contentDirty,setContentDirty]=useState(false),[logoutConfirm,setLogoutConfirm]=useState(false);
 const [selectedOrder,setSelectedOrder]=useState<string|undefined>();
 const [session,setSession]=useState<StaffSession|null>(null),[checking,setChecking]=useState(true),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const onExpired=useCallback(()=>{setSession(null);setNotice('Сессия завершилась. Войдите снова.');},[]);
 const [activationMode,setActivationMode]=useState(false);
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[code,setCode]=useState('');
 const pending=useRef(false),authEpoch=useRef(0);
 useEffect(()=>{
  let active=true;
  const check=async()=>{if(activationMode){setChecking(false);return;}if(pending.current)return;const epoch=++authEpoch.current;try{const s=await api.me();if(active&&epoch===authEpoch.current){setSession(s);setNotice('');}}catch(e){if(active&&epoch===authEpoch.current)setNotice(adminError(e));}finally{if(active&&epoch===authEpoch.current)setChecking(false);}};
  void check();window.addEventListener('focus',check);
  return()=>{active=false;window.removeEventListener('focus',check);};
 },[activationMode]);
 async function login(e:FormEvent){e.preventDefault();if(pending.current)return;pending.current=true;authEpoch.current++;setBusy(true);setNotice('');
  try{setSession(await api.login(email,password,code));setPassword('');setCode('');}catch(e){setNotice(adminError(e));setCode('');}finally{pending.current=false;setBusy(false);}}
 async function logout(){if(!session||pending.current)return;pending.current=true;authEpoch.current++;setBusy(true);
  try{await api.logout(session.csrfToken);setSession(null);setNotice('');}catch(e){setNotice(adminError(e));}finally{pending.current=false;setBusy(false);}}
 return <div className={shell.shell}>
 <header className={shell.header}><div className={shell.brand}><strong>ASAYA</strong><small>Управление магазином</small></div>
 {session&&<nav className={shell.nav} aria-label="Разделы админки">{([['content','Редактор сайта'],['catalog','Товары'],['orders','Заказы'],['statistics','Аналитика'],['integration','Настройки'],['employees','Сотрудники']] as const).filter(([key])=>session.user.staffRole!=='manager'||!['employees','integration'].includes(key)).map(([key,label])=><button key={key} aria-current={section===key?'page':undefined} onClick={()=>setSection(key)}>{label}{key==='content'&&contentDirty?' •':''}</button>)}</nav>}
 <div className={shell.headerActions}><Link href="/">Открыть сайт ↗</Link>{session&&<button disabled={busy} onClick={()=>contentDirty?setLogoutConfirm(true):void logout()}>Выйти</button>}</div></header>
 {process.env.NEXT_PUBLIC_EDITOR_PREVIEW==='true'&&<p className={shell.notice}>Предпросмотр редактора · тестовые данные на этом компьютере. Изменения не затрагивают сайт ASAYA.</p>}
 {notice&&<p role="alert" className={shell.notice}>{notice}</p>}
 {logoutConfirm&&<div role="alert" className={shell.notice}><p>В редакторе сайта есть несохранённые правки. Выйти без сохранения?</p><button disabled={busy} onClick={()=>{setLogoutConfirm(false);void logout();}}>Выйти без сохранения</button><button onClick={()=>{setLogoutConfirm(false);setSection('content');}}>Вернуться к редактору</button></div>}
 <main>{checking?<p className={shell.checking}>Проверяем доступ…</p>:session?<>
 <div hidden={section!=='content'}><AdminSiteEditor key={session.user.id} session={session} onExpired={onExpired} onDirty={setContentDirty}/></div>
 <div className={styles.main} hidden={section==='content'}>
 <div hidden={section!=='catalog'}><h1>Товары</h1><CatalogEditor key={session.user.id} session={session} onExpired={onExpired}/></div>
 {section==='integration'&&session.user.staffRole!=='manager'&&<AdminBanner csrf={session.csrfToken} onExpired={onExpired}/>}
 {section==='integration'&&session.user.staffRole!=='manager'&&<AdminIntegration onExpired={onExpired} onOrder={id=>{setSelectedOrder(id);setSection('orders');}}/>}
 {section==='statistics'&&<AdminStatistics onExpired={onExpired} csrf={session.csrfToken}/>}
 {section==='orders'&&<AdminOrders key={selectedOrder} initialOrderId={selectedOrder} session={session} onExpired={onExpired}/>}
 {section==='employees'&&session.user.staffRole!=='manager'&&<AdminEmployees session={session} onExpired={onExpired}/>}
 </div></>:<div className={styles.main}>{activationMode?<StaffActivation onDone={s=>{setSession(s);setActivationMode(false);}} onBack={()=>setActivationMode(false)}/>:<form className={styles.login} onSubmit={login}><h1>Вход в кабинет</h1><p>Управляйте страницами, товарами и заказами ASAYA.</p><fieldset disabled={busy}>
 <label>Почта сотрудника<input type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)}/></label>
 <label>Пароль<input type="password" autoComplete="current-password" required maxLength={256} value={password} onChange={e=>setPassword(e.target.value)}/></label>
 <label>Код приложения или резервный код<input autoComplete="one-time-code" required maxLength={64} value={code} onChange={e=>setCode(e.target.value.trim())}/></label>
 <button className={styles.primary}>Войти</button><button type="button" onClick={()=>setActivationMode(true)}>Первый вход / восстановление доступа</button></fieldset></form>}</div>}</main></div>;
}
function CatalogEditor({session,onExpired}:{session:StaffSession;onExpired:()=>void}){
 const {reloadCatalog}=useShop();
 const [tab,setTab]=useState('main');
 const [saveFailed,setSaveFailed]=useState(false);
 const [checkedAt,setCheckedAt]=useState(0);
 useEffect(()=>{const update=()=>setCheckedAt(Date.now());queueMicrotask(update);const timer=setInterval(update,30000);return()=>clearInterval(timer);},[]);
 const [category,setCategory]=useState(''),[appliedFilter,setAppliedFilter]=useState({search:'',category:''});
 const [rows,setRows]=useState<ProductRow[]>([]),[search,setSearch]=useState(''),[next,setNext]=useState<number|null>(null);
 const [product,setProduct]=useState<AdminProduct|null>(null),[draft,setDraft]=useState<AdminDraft>(blankDraft),[dirty,setDirty]=useState(false);
 const [operationBusy,setBusy]=useState(false),[mediaBusy,setMediaBusy]=useState(false),[notice,setNotice]=useState(''),[confirm,setConfirm]=useState<'publish'|'unpublish'|'discard'|'remove'|null>(null);
 const busy=operationBusy||mediaBusy;
 const issues=publicationIssues(draft),deleted=product?.lifecycle==='deleted';
 const [history,setHistory]=useState<Array<{action:string;createdAt:string;actorId:string}>>([]);
 const lock=useRef(false),nextAction=useRef<(()=>Promise<void>)|null>(null);
 useEffect(()=>{if(!dirty)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
 async function run(action:()=>Promise<void>){
  if(lock.current||mediaBusy)return;lock.current=true;setBusy(true);setNotice('');
  try{await action();}catch(e){setSaveFailed(true);setNotice(adminError(e));if(e instanceof AuthClientError&&e.code==='UNAUTHENTICATED')onExpired();}
  finally{lock.current=false;setBusy(false);}
 }
 useEffect(()=>{
  let active=true;
  api.list().then(r=>{if(active){setRows(r.items);setNext(r.nextOffset);}}).catch(e=>{if(active)setNotice(adminError(e));});
  return()=>{active=false;};
 },[]);
 async function list(offset=0){const filter=offset?appliedFilter:{search,category};const r=await api.list(filter.search,offset,filter.category);setAppliedFilter(filter);setRows(previous=>offset?[...previous,...r.items]:r.items);setNext(r.nextOffset);}
 async function open(id:string){
  const p=await api.detail(id);setProduct(p);setDraft(initialDraft(p));setDirty(false);setSaveFailed(false);setConfirm(null);
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
   await api.save(product.id,cleaned,product.revision,session.csrfToken);await open(product.id);await list();reloadCatalog();setSaveFailed(false);setNotice('Сохранено · Не опубликовано. Для изменения сайта нажмите «Опубликовать».');
  });
 }
 async function publication(){
  if(!product)return;const operation=confirm;
  await run(async()=>{if(operation==='publish')await api.publish(product.id,product.revision,session.csrfToken);else await api.unpublish(product.id,product.revision,session.csrfToken);
   await open(product.id);await list();reloadCatalog();setNotice(operation==='publish'?'Товар опубликован.':'Товар скрыт с витрины. Заказы и история сохранены.');});
 }
 async function remove(){if(!product||confirm!=='remove')return;await run(async()=>{const outcome=await api.remove(product.id,product.revision,product.draft.sku,session.csrfToken);if(outcome==='archived')await open(product.id);else{setProduct(null);setDirty(false);setConfirm(null);}await list();reloadCatalog();setNotice(outcome==='archived'?'Товар архивирован. История и существующие заказы сохранены.':'Неиспользованный черновик удалён.');});}
 const labels:Record<string,string>={'product.archived':'Товар архивирован','product.deleted':'Удалён неиспользованный черновик','product.draft_saved':'Сохранён черновик','product.published':'Опубликован товар','product.unpublished':'Товар скрыт','inventory.adjusted':'Изменён остаток'};
 const textField=(label:string,key:'name'|'slug')=><label>{label}<input value={draft[key]} maxLength={key==='slug'?80:300} onChange={e=>change({[key]:e.target.value})}/></label>;
 const contentField=(label:string,key:'description'|'volume'|'usage'|'ingredients'|'aroma'|'image'|'safety',large=false)=><label>{label}{large?<textarea aria-label={label} rows={4} value={draft.content[key]} onChange={e=>content({[key]:e.target.value})}/>:<input aria-label={label} value={draft.content[key]} onChange={e=>content({[key]:e.target.value})}/>}</label>;
 const lines=(label:string,key:'features'|'gallery'|'recommendations')=><label>{label}<textarea rows={3} value={draft.content[key].join('\n')} onChange={e=>content({[key]:e.target.value.split('\n')})}/></label>;
 return <><p>Новую карточку сохраните и опубликуйте. Сохранение меняет только черновик. Для изменения сайта нажмите «Опубликовать». Остатки не влияют на публикацию.</p>
 {notice&&<p role="status" className={styles.notice}>{notice}</p>}
 {confirm==='discard'&&<div className={styles.notice}><p>Есть несохранённые правки. Отбросить их и продолжить?</p><button disabled={busy} onClick={()=>{setConfirm(null);void run(nextAction.current!);}}>Отбросить правки</button><button onClick={()=>setConfirm(null)}>Остаться</button></div>}
 <div className={styles.layout}><aside className={styles.sidebar}><form onSubmit={e=>{e.preventDefault();void run(()=>list());}}><label>Найти товар<input value={search} onChange={e=>setSearch(e.target.value)}/></label><label>Категория в списке<select value={category} onChange={e=>setCategory(e.target.value)}><option value="">Все категории</option><option value="hair">Волосы</option><option value="body">Тело</option><option value="face">Лицо</option><option value="sets">Наборы</option></select></label><button disabled={busy}>Найти</button></form>
 <button className={styles.primary} disabled={busy} onClick={newProduct}>Добавить товар</button>
 <ul>{rows.map(row=><li key={row.id}><button disabled={busy} aria-current={product?.id===row.id?'true':undefined} onClick={()=>choose(()=>open(row.id))}><span className={styles.productRow}>{row.image?<Image unoptimized width={56} height={64} className={styles.thumbnail} src={row.image.startsWith('/')?assetPath(row.image):row.image} alt=""/>:<span className={styles.thumbnail}>Нет фото</span>}<span><strong>{row.name||'Без названия'}</strong><span>{row.sku}</span><span>{({hair:'Волосы',body:'Тело',face:'Лицо',sets:'Наборы','':'Без категории'})[row.category]} · {lifecycleLabels[row.lifecycle??(row.active?'published':'draft')]}</span></span></span></button></li>)}</ul>
 {!rows.length&&<p>Товары не найдены.</p>}{next!==null&&<button disabled={busy} onClick={()=>void run(()=>list(next))}>Показать ещё</button>}</aside>
 <section className={styles.editor}>{!product?<p>Выберите товар или добавьте новый.</p>:<><header className={styles.productToolbar}><h2>{draft.name||'Новый товар'}</h2><p>{lifecycleLabels[product.lifecycle??(product.active?'published':product.publishedAt?'unpublished':'draft')]} · {saveFailed?'Ошибка сохранения':dirty?'Есть несохранённые изменения':product.active&&!product.hasUnpublishedChanges?'Опубликовано':'Сохранено · Не опубликовано'}</p>
 <div className={styles.actions}><button type="submit" form="product-edit" disabled={busy||deleted||!dirty}>Сохранить</button><button disabled={busy||deleted||!product.hasDraft||dirty||issues.length>0} onClick={()=>setConfirm('publish')}>Опубликовать</button><button disabled={busy||dirty||!product.active} onClick={()=>setConfirm('unpublish')}>Снять с публикации</button>
 
 {product.revision>0&&<button disabled={busy} onClick={()=>choose(()=>open(product.id))}>Загрузить с сервера</button>}
 {product.active&&<Link href={'/product/'+product.draft.slug}>Посмотреть товар</Link>}</div></header>
 {(confirm==='publish'||confirm==='unpublish')&&<div className={styles.notice}><p>{confirm==='publish'?'Опубликовать сохранённые данные и цены?':'Скрыть товар с витрины? Существующие заказы сохранятся.'}</p><button disabled={busy} onClick={()=>void publication()}>Подтвердить</button><button disabled={busy} onClick={()=>setConfirm(null)}>Назад</button></div>}
 {confirm==='remove'&&<div className={styles.confirmModal} role="dialog" aria-modal="true" aria-label="Удаление товара"><p>Убрать товар «{product.draft.name}» ({product.draft.sku})? Опубликованный или использованный товар будет архивирован. Только неиспользованный черновик удалится безвозвратно.</p><button disabled={busy} onClick={()=>void remove()}>Подтвердить удаление или архивирование</button><button disabled={busy} onClick={()=>setConfirm(null)}>Назад</button></div>}
 {issues.length>0&&<p role="status">Обязательные поля: {issues.map(key=>publicationLabels[key]).join('; ')}.</p>}
 <nav className={styles.productTabs} aria-label="Разделы карточки">{([['main','Основное'],['pdp','Контент страницы'],['placement','Размещение'],['technical','Технические данные'],['stock','Остатки']] as const).map(([key,label])=><button key={key} type="button" aria-pressed={tab===key} onClick={()=>setTab(key)}>{label}</button>)}</nav><form id="product-edit" onSubmit={save} key={product.id+':'+product.revision}><fieldset disabled={busy||deleted}>
 <div hidden={tab!=='main'}><h3>Основное</h3>{textField('Название','name')}
 <div className={styles.columns}><label>Категория<select value={draft.content.category} onChange={e=>content({category:e.target.value as ProductContent['category']})}><option value="hair">Волосы</option><option value="body">Тело</option><option value="face">Лицо</option><option value="sets">Наборы</option></select></label>
 <label>Тип товара<select value={draft.content.setKind} onChange={e=>content({setKind:e.target.value as ProductContent['setKind']})}><option value="none">Отдельный товар</option><option value="combo">Комбо-набор</option><option value="gift">Подарочный набор</option></select></label></div>
 {contentField('Описание','description',true)}<div className={styles.columns}><label>Объём / количество<input type="number" min="0.001" max="1000000" step="any" value={draft.content.size?.value??''} onChange={e=>content({size:e.target.value?{value:Number(e.target.value),unit:draft.content.size?.unit??'ml'}:undefined})}/></label><label>Единица измерения<select disabled={!draft.content.size} value={draft.content.size?.unit??'ml'} onChange={e=>content({size:{value:draft.content.size!.value,unit:e.target.value as 'ml'|'g'|'pcs'}})}><option value="ml">мл</option><option value="g">г</option><option value="pcs">шт.</option></select></label></div>{!draft.content.size&&<><p>Для старой карточки размер сохранён текстом. Укажите число и единицу, чтобы обновить его.</p>{contentField('Текущий размер','volume')}</>}{lines('Особенности — по одной на строке','features')}
 {contentField('Применение','usage',true)}{contentField('Состав','ingredients',true)}{contentField('Аромат','aroma',true)}
 <h3>Фотографии</h3>
 <AdminMediaEditor crops={draft.content.imageCrops} onCrop={(url,crop)=>{const imageCrops={...draft.content.imageCrops};if(crop)imageCrops[url]=crop;else delete imageCrops[url];content({imageCrops});}} image={draft.content.image} gallery={draft.content.gallery} csrf={session.csrfToken} disabled={operationBusy} onBusy={setMediaBusy} onExpired={onExpired}
 onUploaded={(url,target)=>{setDraft(d=>({...d,content:{...d.content,...(target==='main'?{image:url}:{gallery:[...d.content.gallery.filter(Boolean),url].slice(0,12)})}}));setDirty(true);setConfirm(null);}}
 onMain={image=>content({image})} onGallery={gallery=>content({gallery})}/>
 <details><summary>Фото по ссылке</summary><p>Можно использовать HTTPS-ссылку или путь к изображению сайта.</p>{contentField('Основное фото — ссылка','image')}{lines('Галерея — по одной ссылке на строке','gallery')}</details>
 <h3>Цена</h3><div className={styles.columns}><PriceField label="Обычная цена, ₽" value={draft.regularMinor} onChange={v=>change({regularMinor:v})}/><PriceField label="Цена продажи, ₽" value={draft.finalMinor} onChange={v=>change({finalMinor:v})}/></div>
 <label>Метка<select value={draft.content.badge} onChange={e=>content({badge:e.target.value})}>{['','Бестселлер','Новинка','Выбор ASAYA','Лимитированная серия'].map(v=><option key={v} value={v}>{v||'Без метки'}</option>)}</select></label>
 </div><div hidden={tab!=='pdp'}><AdminPdpEditor products={rows.filter(p=>p.active&&p.sku!==draft.sku)} legacyOnly={['1S-BA-03','1S-BA-01'].includes(draft.sku)} value={draft.content.pdp} onChange={pdp=>content({pdp})} csrf={session.csrfToken} disabled={operationBusy} onBusy={setMediaBusy} onExpired={onExpired}/><details><summary>Инструкция и рекомендации прежней карточки</summary> <h3>Инструкция</h3><label>Шаги — по одному на строке<textarea rows={4} value={draft.content.instruction.steps.join('\n')} onChange={e=>content({instruction:{...draft.content.instruction,steps:e.target.value.split('\n')}})}/></label>
 <label>Количество средства<textarea value={draft.content.instruction.amount} onChange={e=>content({instruction:{...draft.content.instruction,amount:e.target.value}})}/></label>
 <label>Совет<textarea value={draft.content.instruction.tip} onChange={e=>content({instruction:{...draft.content.instruction,tip:e.target.value}})}/></label>
 {contentField('Указания и предостережения с упаковки','safety',true)}
 {!draft.content.pdp&&lines('Адреса рекомендуемых карточек — по одному на строке','recommendations')}
</details></div><div hidden={tab!=='placement'}> <fieldset><legend>Размещение на сайте</legend><p>Меньшее число — ближе к началу. Категория определяет раздел каталога. Подборки на главной включаются отдельно от метки на карточке.</p>
 <label>Порядок в каталоге<input type="number" min={0} max={100000} required value={draft.content.placement?.catalogOrder??0} onChange={e=>content({placement:{catalogOrder:Number(e.target.value),bestsellerOrder:draft.content.placement?draft.content.placement.bestsellerOrder:(draft.content.badge==='Бестселлер'?0:null),newOrder:draft.content.placement?draft.content.placement.newOrder:(draft.content.badge==='Новинка'?0:null)}})}/></label>
 {(['bestsellerOrder','newOrder'] as const).map((key,index)=>{const p=draft.content.placement??{catalogOrder:0,bestsellerOrder:draft.content.badge==='Бестселлер'?0:null,newOrder:draft.content.badge==='Новинка'?0:null};return <div key={key}><label><input type="checkbox" checked={p[key]!==null} onChange={e=>content({placement:{...p,[key]:e.target.checked?0:null}})}/>{index===0?'Показывать в бестселлерах':'Показывать в новинках'}</label>{p[key]!==null&&<label>Позиция в подборке<input type="number" min={0} max={100000} required value={p[key]!} onChange={e=>content({placement:{...p,[key]:Number(e.target.value)}})}/></label>}</div>;})}</fieldset>
</div><div hidden={tab!=='technical'}><p>Служебные параметры. Меняйте их только при необходимости настройки карточки.</p> <h3>Основная информация</h3><p>Пустые артикул и адрес карточки будут созданы автоматически. Артикул можно исправить только до первой публикации и использования в заказах или интеграциях. Архивирование не снимает это ограничение.</p><label>Артикул<input placeholder="Будет создан автоматически" maxLength={100} readOnly={product.active||!!product.publishedAt} value={draft.sku} onChange={e=>change({sku:e.target.value})}/></label>
 {textField('Адрес карточки: латинские буквы, цифры и дефисы','slug')}
 <h3>Параметры отправки</h3><div className={styles.columns}>{([['Вес, г','weightG'],['Ширина, мм','widthMm'],['Высота, мм','heightMm'],['Глубина, мм','depthMm']] as const).map(([label,key])=><label key={key}>{label}<input type="number" min={1} value={draft[key]??''} onChange={e=>change({[key]:e.target.value===''?null:Number(e.target.value)})}/></label>)}</div>
 </div></fieldset></form>
 <div hidden={tab!=='stock'}>
 {product.hasDraft&&<AdminTestStock key={product.id} id={product.id} csrf={session.csrfToken} onExpired={onExpired} onSaved={reloadCatalog} disabled={busy||deleted}/>}
 {product.hasDraft&&<section><h3>Остатки по складам</h3><p>Для подключённого склада остаток обновляется из СДЭК Фулфилмента. Ручная корректировка доступна только для складов без синхронизации.</p>{!product.stocks.length&&<p>Склады ещё не заведены на сервере.</p>}
 {product.stocks.map(s=>s.source?<div className={styles.stock} key={s.warehouseId}><p>{s.name} · доступно {s.source.available} · в резерве {s.reserved}<br/>Источник: СДЭК Фулфилмент · остаток в выгрузке {s.source.reportedQuantity}<br/>Выгрузка: {new Date(s.source.generatedAt).toLocaleString("ru-RU")}<br/>{s.source.healthy&&Date.parse(s.source.expiresAt)>checkedAt?"Синхронизация работает":"Данные устарели или обновление не удалось. Продажа недоступна."}</p></div>:<form className={styles.stock} key={s.warehouseId+':'+s.onHand+':'+s.reserved} onSubmit={e=>{e.preventDefault();const onHand=Number(new FormData(e.currentTarget).get('onHand'));void run(async()=>{await api.stock(product.id,{warehouseId:s.warehouseId,expectedOnHand:s.onHand,onHand},session.csrfToken);const updated=await api.detail(product.id);setProduct(p=>p?{...p,stocks:updated.stocks}:p);setHistory(await api.history(product.id));reloadCatalog();setNotice('Остаток обновлён.');});}}><label>{s.name} · в резерве {s.reserved}<input type="number" name="onHand" required min={s.reserved} max={1000000} defaultValue={s.onHand}/></label><button disabled={busy||!s.active}>Обновить остаток</button></form>)}</section>}
 </div><details><summary>Последние действия</summary><ul className={styles.history}>{history.map((h,i)=><li key={i}>{new Date(h.createdAt).toLocaleString('ru-RU')} — {labels[h.action]??h.action}<small>Сотрудник: {h.actorId}</small></li>)}</ul></details>{product.hasDraft&&!deleted&&<section className={styles.dangerZone}><h3>Опасная зона</h3><p>Удаление опубликованного или использованного товара сохраняет историю заказов.</p><button disabled={busy||dirty} onClick={()=>setConfirm('remove')}>{!product.active&&!product.publishedAt?'Удалить черновик':'Удалить товар'}</button></section>}</>}</section></div></>;
}
