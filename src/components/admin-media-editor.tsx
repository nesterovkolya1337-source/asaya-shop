"use client";
import {CroppedImage} from './cropped-image';
import {ProductCropEditor} from './product-crop-editor';
import {useEffect,useRef,useState} from 'react';
import {assetPath} from '@/lib/asset-path';
import {AuthClientError} from '@/lib/auth-client';
import {createMediaClient,mediaError,validateImageFile} from '@/lib/media-client';
import styles from './server-admin.module.css';
const api=createMediaClient(assetPath('/api/admin/v1'));
type Job={id:string;file:File;target:'main'|'gallery';error:string};
type Props={maxGallery?:number;crops?:Record<string,string>;onCrop:(url:string,crop:string|undefined)=>void;image:string;gallery:string[];csrf:string;disabled:boolean;onBusy:(busy:boolean)=>void;onExpired:()=>void;
 onUploaded:(url:string,target:'main'|'gallery')=>void;onMain:(url:string)=>void;onGallery:(urls:string[])=>void};
function previewUrl(url:string){
 if(/^https:\/\/[^\s]+$/.test(url))return url;
 if((url.startsWith('/images/')&&!url.includes('..'))||/^\/api\/store\/v1\/media\/[a-f0-9-]+$/.test(url))return assetPath(url);
 return '';
}
export function AdminMediaEditor(props:Props){
 const maxGallery=props.maxGallery??12;
 const [busy,setBusy]=useState(false),[jobs,setJobs]=useState<Job[]>([]),[message,setMessage]=useState('');
 const active=useRef(true),locked=useRef(false),latest=useRef(props);
 useEffect(()=>{latest.current=props;});
 useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
 async function upload(queue:Job[]){
  if(locked.current||props.disabled)return;locked.current=true;setBusy(true);props.onBusy(true);setMessage('');
  const failed:Job[]=[];
  try{
   for(const job of queue){
    if(!active.current)break;
    if(job.target==='gallery'&&latest.current.gallery.filter(Boolean).length>=maxGallery){failed.push({...job,error:'Достигнут лимит изображений. Уберите одно и повторите загрузку.'});continue;}
    setMessage('Загрузка и обработка: '+job.file.name);
    try{const image=await api.upload(job.id,job.file,props.csrf);if(active.current)latest.current.onUploaded(image.url,job.target);}
    catch(e){
     if(e instanceof AuthClientError&&e.code==='UNAUTHENTICATED'){latest.current.onExpired();break;}
     failed.push({...job,error:mediaError(e)});
    }
   }
  }finally{
   locked.current=false;
   if(active.current){setJobs(failed);setBusy(false);setMessage(failed.length?'Часть файлов не загружена. Успешные фото уже добавлены в черновик.':'Фото добавлены. Сохраните черновик, затем опубликуйте карточку.');latest.current.onBusy(false);}
  }
 }
 function select(files:FileList|null,target:Job['target']){
  if(!files?.length)return;const list=Array.from(files),limit=target==='main'?1:maxGallery-props.gallery.filter(Boolean).length;
  if(list.length>limit){setMessage('Можно выбрать ещё '+Math.max(0,limit)+' фото.');return;}
  try{list.forEach(validateImageFile);}catch(e){setMessage(mediaError(e));return;}
  void upload(list.map(file=>({file,id:crypto.randomUUID(),target,error:''})));
 }
 const picture=(url:string,label:string)=>previewUrl(url)?<span style={{display:"block",position:"relative",width:150,height:150,overflow:"hidden"}}><CroppedImage crop={props.crops?.[url]} unoptimized src={previewUrl(url)} alt={label} width={150} height={150} className={styles.mediaImage}/></span>:<p>Фото не выбрано</p>;
 const move=(index:number,delta:number)=>{const urls=[...props.gallery];[urls[index],urls[index+delta]]=[urls[index+delta],urls[index]];props.onGallery(urls);};
 return <section aria-label="Загрузка фотографий"><p>JPG, PNG или WebP до 20 МБ. Основное фото и до {maxGallery} фото в галерее. После загрузки сохраните и опубликуйте карточку.</p>
 <div className={styles.mediaCard}>{picture(props.image,'Основное фото товара')}{props.image&&<ProductCropEditor source={props.image} value={props.crops?.[props.image]} disabled={busy||props.disabled} onSave={v=>props.onCrop(props.image,v)}/>}
 <label>Загрузить основное фото<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy||props.disabled} onChange={e=>{select(e.target.files,'main');e.target.value='';}}/></label>
 {props.image&&<button type="button" disabled={busy||props.disabled} onClick={()=>props.onMain('')}>Убрать основное фото</button>}</div>
 <label>Добавить фото в галерею<input type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={busy||props.disabled||props.gallery.length>=maxGallery} onChange={e=>{select(e.target.files,'gallery');e.target.value='';}}/></label>
 <div className={styles.mediaGrid}>{props.gallery.map((url,index)=><div className={styles.mediaCard} key={index+':'+url}>{picture(url,'Фото галереи '+(index+1))}<ProductCropEditor source={url} value={props.crops?.[url]} disabled={busy||props.disabled} onSave={v=>props.onCrop(url,v)}/>
 <div className={styles.actions}><button type="button" disabled={busy||props.disabled||index===0} onClick={()=>move(index,-1)} aria-label={'Передвинуть фото '+(index+1)+' раньше'}>←</button>
 <button type="button" disabled={busy||props.disabled||index===props.gallery.length-1} onClick={()=>move(index,1)} aria-label={'Передвинуть фото '+(index+1)+' позже'}>→</button>
 <button type="button" disabled={busy||props.disabled} onClick={()=>props.onGallery(props.gallery.filter((_,i)=>i!==index))}>Убрать фото {index+1}</button></div></div>)}</div>
 {busy&&<progress aria-label="Загрузка и обработка изображения"/>}{message&&<p role="status">{message}</p>}
 {jobs.length>0&&<div role="alert">{jobs.map(job=><p key={job.id}>{job.file.name}: {job.error}</p>)}<button type="button" disabled={busy||props.disabled} onClick={()=>void upload(jobs)}>Повторить незагруженные</button><button type="button" disabled={busy||props.disabled} onClick={()=>setJobs([])}>Убрать из очереди</button></div>}
 </section>;
}
