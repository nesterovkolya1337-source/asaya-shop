"use client";
import Image from 'next/image';
import {useEffect,useRef,useState,useCallback,type ChangeEvent} from 'react';
import {assetPath} from '@/lib/asset-path';
import {AuthClientError} from '@/lib/auth-client';
import {createMediaClient,validateImageFile,mediaError} from '@/lib/media-client';
import {createSiteClient,sitePages,sitePageDefaults,blockTemplates,sitePublicationIssues,siteError,isSiteImage,isSharedPage,allowedBlockTypes,type SiteDraft,type SitePageId,type SitePage,type SiteBlock,type SiteField,type BlockType} from '@/lib/site-content-client';
import type {StaffSession} from '@/lib/admin-client';
import styles from './admin-site-editor.module.css';
import {ImageCropEditor} from './image-crop-editor';
const api=createSiteClient(assetPath('/api/admin/v1'));
const media=createMediaClient(assetPath('/api/admin/v1'));
const picture=(url:string)=>url.startsWith('/')?assetPath(url):url;
export function AdminSiteEditor({session,onExpired,onDirty}:{session:StaffSession;onExpired:()=>void;onDirty:(value:boolean)=>void}){
 const [pageId,setPageId]=useState<SitePageId>('home'),[saved,setSaved]=useState<SiteDraft|null>(null),[page,setPage]=useState<SitePage|null>(null);
 const [selected,setSelected]=useState(''),[dirty,setDirty]=useState(false),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
 const [notice,setNotice]=useState(''),[issues,setIssues]=useState<string[]>([]),[device,setDevice]=useState<'desktop'|'mobile'>('desktop');
 const [confirmation,setConfirmation]=useState<'publish'|'restore'|'reload'|SitePageId|null>(null);
 const [library,setLibrary]=useState(false),[previewWidth,setPreviewWidth]=useState(800);
 const [imageFrames,setImageFrames]=useState<{pageId:string;width:number;ratios:Record<string,number>}|null>(null);
 const stage=useRef<HTMLDivElement>(null),properties=useRef<HTMLElement>(null);
 useEffect(()=>{properties.current?.scrollTo({top:0});},[selected]);
 const frame=useRef<HTMLIFrameElement>(null),locked=useRef(false),active=useRef(true),latest=useRef({page,selected,dirty,busy,loading}),expired=useRef(onExpired);
 const requestedBlock=useRef<{pageId:SitePageId;id:string}|null>(null);
 useEffect(()=>{expired.current=onExpired;},[onExpired]);
 useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
 useEffect(()=>{const target=stage.current;if(!target)return;const observer=new ResizeObserver(([entry])=>{if(entry.contentRect.width>0)setPreviewWidth(entry.contentRect.width);});observer.observe(target);return()=>observer.disconnect();},[]);
 useEffect(()=>{onDirty(dirty);return()=>onDirty(false);},[dirty,onDirty]);
 useEffect(()=>{if(!dirty)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
 const sendPreview=useCallback(()=>{const current=latest.current;if(current.page)frame.current?.contentWindow?.postMessage({type:'asaya:preview-content',page:current.page,selected:current.selected},window.location.origin);},[]);
 useEffect(()=>{latest.current={page,selected,dirty,busy,loading};sendPreview();},[page,selected,dirty,busy,loading,sendPreview]);
 useEffect(()=>{
  const receive=(e:MessageEvent)=>{
   if(e.origin!==window.location.origin||e.source!==frame.current?.contentWindow)return;
   if(e.data?.type==='asaya:preview-ready'){sendPreview();return;}
   if(e.data?.type==='asaya:preview-images'){
    if(!sitePages.some(p=>p.id===e.data.pageId)||![390,1440].includes(e.data.width)||!e.data.ratios||typeof e.data.ratios!=='object'||Array.isArray(e.data.ratios))return;
    const entries=Object.entries(e.data.ratios);if(entries.length>900)return;
    const ratios=Object.fromEntries(entries.filter(([key,value])=>key.length<150&&typeof value==='number'&&Number.isFinite(value)&&value>.05&&value<50)) as Record<string,number>;
    setImageFrames({pageId:e.data.pageId,width:e.data.width,ratios});return;
   }
   const current=latest.current;
   if(e.data?.type!=='asaya:select-block'||typeof e.data.id!=='string'||current.busy||current.loading)return;
   const target=sitePages.find(p=>p.id===(e.data.pageId??current.page?.id));if(!target)return;
   if(target.id===current.page?.id){if(current.page.blocks.some(b=>b.id===e.data.id))setSelected(e.data.id);return;}
   requestedBlock.current={pageId:target.id,id:e.data.id};setLibrary(false);
   if(current.dirty){setConfirmation(target.id);return;}
   setLoading(true);setNotice('');setIssues([]);setPage(null);setSaved(null);setPageId(target.id);
  };
  window.addEventListener('message',receive);return()=>window.removeEventListener('message',receive);
 },[sendPreview]);
 useEffect(()=>{let valid=true;void api.get(pageId).then(r=>{if(valid){setSaved(r);setPage(r.draft);const target=requestedBlock.current;setSelected(target?.pageId===pageId&&r.draft.blocks.some(b=>b.id===target.id)?target.id:r.draft.blocks[0].id);requestedBlock.current=null;setDirty(false);}}).catch(e=>{if(valid){setNotice(siteError(e));if(e instanceof AuthClientError&&['UNAUTHENTICATED','FORBIDDEN'].includes(e.code))expired.current();}}).finally(()=>{if(valid)setLoading(false);});return()=>{valid=false;};},[pageId]);
 async function run(action:()=>Promise<void>){if(locked.current)return;locked.current=true;setBusy(true);setNotice('');setIssues([]);try{await action();}catch(e){if(active.current){setNotice(siteError(e));if(e instanceof AuthClientError&&['UNAUTHENTICATED','FORBIDDEN'].includes(e.code))expired.current();}}finally{locked.current=false;if(active.current)setBusy(false);}}
 function edit(next:SitePage){setPage(next);setDirty(true);setIssues([]);setNotice('');setConfirmation(null);}
 function updateBlock(block:SiteBlock){if(page)edit({...page,blocks:page.blocks.map(b=>b.id===block.id?block:b)});}
 function switchPage(id:SitePageId){if(id===pageId)return;requestedBlock.current=null;setLibrary(false);if(dirty){setConfirmation(id);return;}setLoading(true);setNotice('');setIssues([]);setPage(null);setSaved(null);setPageId(id);}
 function moveTarget(index:number,delta:number){
  if(!page)return -1;
  if(!isSharedPage(pageId))return index+delta>=0&&index+delta<page.blocks.length?index+delta:-1;
  if(pageId!=='footer'||page.blocks[index].type!=='footerLinks')return -1;
  const positions=page.blocks.flatMap((b,i)=>b.type==='footerLinks'?[i]:[]),at=positions.indexOf(index);return positions[at+delta]??-1;
 }
 function moveBlock(index:number,delta:number){if(!page)return;const target=moveTarget(index,delta);if(target<0)return;const blocks=[...page.blocks];[blocks[index],blocks[target]]=[blocks[target],blocks[index]];edit({...page,blocks});}
 const availableTypes=allowedBlockTypes(pageId).filter(type=>!isSharedPage(pageId)||type==='footerLinks'||!page?.blocks.some(b=>b.type===type));
 function addBlock(type:BlockType){if(!page||page.blocks.length>=30||!availableTypes.includes(type))return;const source=Object.values(sitePageDefaults).flatMap(p=>p.blocks).find(b=>b.type===type)!;const added={...structuredClone(source),id:crypto.randomUUID()};const at=page.blocks.findIndex(b=>b.id===selected)+1;const blocks=[...page.blocks];blocks.splice(at,0,added);edit({...page,blocks});setSelected(added.id);setLibrary(false);}
 async function refresh(){const r=await api.get(pageId);if(active.current){setSaved(r);setPage(r.draft);setDirty(false);setSelected(id=>r.draft.blocks.some(b=>b.id===id)?id:r.draft.blocks[0].id);}}
 async function save(){if(!page||!saved)return;await run(async()=>{await api.save(pageId,page,saved.revision,session.csrfToken);if(active.current){setSaved({...saved,revision:saved.revision+1,draft:page});setDirty(false);setNotice('Черновик сохранён. Посетители пока видят опубликованную версию.');}});}
 async function accept(){const action=confirmation;setConfirmation(null);if(!saved)return;if(action==='publish')await run(async()=>{await api.publish(pageId,saved.revision,session.csrfToken);await refresh();setNotice(isSharedPage(pageId)?'Общий раздел опубликован. Изменения появятся на всех страницах при следующем открытии сайта.':'Страница опубликована. Изменения появятся при следующем открытии сайта.');});else if(action==='restore')await run(async()=>{await api.restore(pageId,saved.revision,session.csrfToken);await refresh();setNotice('Черновик восстановлен из опубликованной версии.');});else if(action==='reload')await run(refresh);else if(action){setDirty(false);setLoading(true);setNotice('');setPage(null);setSaved(null);setPageId(action);}}
 const block=page?.blocks.find(b=>b.id===selected),template=block?blockTemplates[block.type]:null;
 const itemLimit=block?.type==='siteNavigation'?3:30;
 function updateValue(key:string,value:string,itemIndex?:number){
  if(!block||!template)return;
  const image=(itemIndex===undefined?template.fields:template.items).some(f=>f.key===key&&f.kind==='image');
  const replace=(data:Record<string,string>)=>{const next={...data,[key]:value};if(image&&data[key]!==value)delete next[key+'Crop'];return next;};
  if(itemIndex===undefined)updateBlock({...block,values:replace(block.values)});else updateBlock({...block,items:block.items.map((v,i)=>i===itemIndex?replace(v):v)});
 }
 async function upload(event:ChangeEvent<HTMLInputElement>,key:string,itemIndex?:number){const file=event.target.files?.[0];event.target.value='';if(!file||!block)return;try{validateImageFile(file);}catch(e){setNotice(mediaError(e));return;}await run(async()=>{const result=await media.upload(crypto.randomUUID(),file,session.csrfToken);if(active.current){updateValue(key,result.url,itemIndex);setNotice('Изображение добавлено в черновик. Сохраните изменения.');}});}
 function field(f:SiteField,data:Record<string,string>,itemIndex?:number){
  const value=data[f.key]??'',label=f.label+(f.required?' *':'');
  if(f.kind==='image')return <div key={f.key} className={styles.field}><span>{label}</span><div className={styles.imagePreview}>{value&&isSiteImage(value)?<Image unoptimized src={picture(value)} alt="Выбранное изображение" width={280} height={170}/>:<span>Изображение не выбрано</span>}</div><label className={styles.upload}><input aria-label={itemIndex===undefined?'Заменить изображение':'Изображение карточки '+(itemIndex+1)} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e=>void upload(e,f.key,itemIndex)}/>Загрузить изображение</label><small>JPG, PNG или WebP · до 6 МБ</small><details><summary>Указать ссылку на изображение</summary><input aria-label="Ссылка на изображение" value={value} maxLength={1000} onChange={e=>updateValue(f.key,e.target.value,itemIndex)}/></details>{block&&block.type!=='siteBrand'&&value&&isSiteImage(value)&&<ImageCropEditor source={value} value={data[f.key+'Crop']} type={block.type} device={device} onDevice={setDevice} ratio={imageFrames?.pageId===pageId&&imageFrames.width===(device==='mobile'?390:1440)?imageFrames.ratios[block.id+':'+(itemIndex??0)]:undefined} onChange={crop=>updateValue(f.key+'Crop',crop,itemIndex)}/>}</div>;
  return <label key={f.key} className={styles.field}><span>{label}</span>{f.kind==='long'?<textarea rows={4} maxLength={10000} value={value} onChange={e=>updateValue(f.key,e.target.value,itemIndex)}/>:<input maxLength={f.kind==='link'?1000:500} value={value} placeholder={f.kind==='link'?'/catalog или https://…':undefined} onChange={e=>updateValue(f.key,e.target.value,itemIndex)}/>}</label>;
 }
 const currentPage=sitePages.find(p=>p.id===pageId)!;
 // Preview the same public page visitors see, including when the editor lives under /manage.
 const publicPagePath=currentPage.path;
 const frameWidth=device==='mobile'?390:1440,frameScale=Math.min(1,previewWidth/frameWidth);
 return <section className={styles.editor} aria-label="Редактор сайта">
  <header className={styles.toolbar}><div><p className={styles.eyebrow}>САЙТ ASAYA</p><h1>Редактор сайта</h1><p>Страницы, меню, изображения и контакты</p></div><div className={styles.actions}><span className={dirty?styles.unsaved:styles.saved}>{dirty?'Есть несохранённые правки':saved?.revision?'Черновик сохранён':'Исходная версия сайта'}</span><button disabled={busy||loading||!dirty} onClick={()=>void save()}>Сохранить черновик</button><button className={styles.primary} disabled={busy||loading||dirty||!saved?.revision} onClick={()=>{if(!page)return;const list=sitePublicationIssues(page);setIssues(list);if(!list.length)setConfirmation('publish');}}>Опубликовать</button></div></header>
  {notice&&<p role="status" className={styles.notice}>{notice}</p>}
  {!!issues.length&&<div role="alert" className={styles.notice}><strong>Перед публикацией</strong><ul>{issues.map((issue,i)=><li key={i}>{issue}</li>)}</ul></div>}
  {library&&<section className={styles.library} aria-label="Добавить блок"><header><h2>Добавить блок на страницу</h2><button onClick={()=>setLibrary(false)}>Закрыть</button></header><p>Выберите готовое оформление. Блок появится после выбранного — его тексты и фотографии можно заменить.</p><div>{availableTypes.map(type=>{const t=blockTemplates[type];return <button key={type} disabled={busy} onClick={()=>addBlock(type as BlockType)}>{t.label}<span>+ Добавить</span></button>;})}</div></section>}
  {confirmation&&<div role="alert" className={styles.confirm}><p>{confirmation==='publish'?`Опубликовать «${currentPage.name}»${isSharedPage(pageId)?' на всех страницах сайта':''}? Посетители увидят сохранённые изменения.`:confirmation==='restore'?'Восстановить черновик из последней опубликованной версии? Текущие правки черновика будут заменены.':confirmation==='reload'?'Загрузить последнюю сохранённую версию? Несохранённые правки будут заменены.':'Перейти на другую страницу без сохранения текущих правок?'}</p><button disabled={busy} className={styles.primary} onClick={()=>void accept()}>{confirmation==='publish'?'Да, опубликовать':'Продолжить'}</button><button disabled={busy} onClick={()=>setConfirmation(null)}>Отмена</button></div>}
  {isSharedPage(pageId)&&<p className={styles.notice}>Этот раздел используется на всех страницах. Логотип, меню и контакты остаются на своих местах; порядок ссылок и колонок можно менять. Правки станут общими для сайта после публикации.</p>}
  <div className={styles.workspace}>
   <aside className={styles.blocks}><label className={styles.pageSelect}>Раздел<select value={pageId} disabled={busy||loading} onChange={e=>switchPage(e.target.value as SitePageId)}>{[true,false].map(shared=><optgroup key={String(shared)} label={shared?'На всём сайте':'Страницы сайта'}>{sitePages.filter(p=>isSharedPage(p.id)===shared).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>)}</select></label><div className={styles.panelHeading}><h2>Блоки страницы</h2><span>{page?.blocks.length??0}</span></div><p className={styles.hint}>Выберите блок здесь или нажмите на него в предпросмотре.</p>
   {loading?<p role="status">Загружаем страницу…</p>:<ol className={styles.blockList}>{page?.blocks.map((b,i)=><li key={b.id} data-selected={selected===b.id}><button className={styles.blockSelect} aria-current={selected===b.id?'true':undefined} disabled={busy} onClick={()=>setSelected(b.id)}><span className={styles.blockNumber}>{String(i+1).padStart(2,'0')}</span><span><strong>{blockTemplates[b.type].label}</strong><small>{b.visible?(b.values.title||'Виден на сайте'):'Скрыт на сайте'}</small></span></button><div className={styles.blockTools}><button title="Переместить выше" aria-label={'Выше: '+blockTemplates[b.type].label} disabled={busy||moveTarget(i,-1)<0} onClick={()=>moveBlock(i,-1)}>↑</button><button title="Переместить ниже" aria-label={'Ниже: '+blockTemplates[b.type].label} disabled={busy||moveTarget(i,1)<0} onClick={()=>moveBlock(i,1)}>↓</button><button className={styles.visibility} aria-label={(b.visible?'Скрыть: ':'Показать: ')+blockTemplates[b.type].label} aria-pressed={b.visible} disabled={busy} onClick={()=>updateBlock({...b,visible:!b.visible})}>{b.visible?'Виден':'Скрыт'}</button></div></li>)}</ol>}
   <button className={styles.addItem} disabled={busy||loading||!page||page.blocks.length>=30||!availableTypes.length} onClick={()=>setLibrary(true)}>+ Добавить блок</button><div className={styles.pageTools}><a href={publicPagePath} target="_blank" rel="noreferrer">Открыть страницу ↗</a><button disabled={busy||loading||!saved} onClick={()=>dirty?setConfirmation('reload'):void run(refresh)}>Загрузить сохранённое</button><button disabled={busy||loading||!saved?.revision} onClick={()=>setConfirmation('restore')}>Вернуть опубликованную версию</button></div></aside>
   <div className={styles.preview}><header className={styles.previewToolbar}><span>Предпросмотр · {currentPage.name}</span><div><button aria-pressed={device==='desktop'} onClick={()=>setDevice('desktop')}>Компьютер</button><button aria-pressed={device==='mobile'} onClick={()=>setDevice('mobile')}>Телефон</button></div></header><div className={styles.previewStage} ref={stage}>{page&&<div style={{width:frameWidth*frameScale,height:680,flexShrink:0}}><iframe key={pageId} ref={frame} className={device==='mobile'?styles.mobileFrame:styles.desktopFrame} style={{width:frameWidth,height:680/frameScale,transform:`scale(${frameScale})`,transformOrigin:'top left'}} title={'Предпросмотр: '+currentPage.name} src={publicPagePath+'?asaya-preview=1'} onLoad={sendPreview}/></div>}</div><p className={styles.previewCaption}>Это черновик. Изменения попадут на сайт после публикации.</p></div>
   <aside className={styles.properties} ref={properties}><div className={styles.panelHeading}><h2>{template?.label??'Настройки блока'}</h2></div>{block&&template?<fieldset disabled={busy||loading}><label className={styles.switch}><input type="checkbox" checked={block.visible} onChange={e=>updateBlock({...block,visible:e.target.checked})}/>Показывать на сайте</label>{!block.visible&&<p className={styles.hint}>Блок скрыт в предпросмотре. Его содержимое можно редактировать.</p>}{template.fields.map(f=>field(f,block.values))}{template.items.length>0&&<><div className={styles.panelHeading}><h3>{isSharedPage(pageId)?'Ссылки и пункты':'Карточки блока'}</h3><span>{block.items.length}</span></div>{block.items.map((item,i)=><details key={block.id+':'+i} className={styles.item} open={block.items.length===1}><summary>{i+1}. {item.title||item.alt||'Изображение'}</summary>{template.items.map(f=>field(f,item,i))}<div className={styles.itemTools}><button disabled={i===0||busy} onClick={()=>{const items=[...block.items];[items[i-1],items[i]]=[items[i],items[i-1]];updateBlock({...block,items});}}>Выше</button><button disabled={i===block.items.length-1||busy} onClick={()=>{const items=[...block.items];[items[i],items[i+1]]=[items[i+1],items[i]];updateBlock({...block,items});}}>Ниже</button><button disabled={busy} onClick={()=>updateBlock({...block,items:block.items.filter((_,n)=>n!==i)})}>Убрать</button></div></details>)}<button className={styles.addItem} disabled={block.items.length>=itemLimit||busy} onClick={()=>updateBlock({...block,items:[...block.items,Object.fromEntries(template.items.map(f=>[f.key,'']))]})}>{isSharedPage(pageId)?'+ Добавить ссылку':'+ Добавить карточку'}</button></>}{block.type==='siteNavigation'&&<p className={styles.hint}>В верхней строке помещается до трёх ссылок. Остальные разделы добавляйте в раскрывающееся меню.</p>}{block.type==='instructionList'&&<p className={styles.hint}>Инструкции отдельных товаров редактируются в разделе «Товары».</p>}{block.type==='products'&&<p className={styles.hint}>Состав подборок и порядок товаров меняются в разделе «Товары», в настройке размещения на сайте.</p>}<p className={styles.hint}>* Обязательные поля для публикации. Пустые поля можно сохранить в черновик.</p></fieldset>:<p className={styles.hint}>Выберите блок для редактирования.</p>}</aside>
  </div>
 </section>;
}
