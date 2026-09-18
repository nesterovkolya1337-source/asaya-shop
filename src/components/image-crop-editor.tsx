'use client';
import {useRef,type PointerEvent} from 'react';
import {assetPath} from '@/lib/asset-path';
import {parseImageCrop,defaultImageCrop,cropReferenceRatio,type ImageCrop} from '../../backend/src/image-crop';
import {CroppedImage} from './cropped-image';
import styles from './image-crop-editor.module.css';
type Props={source:string;value?:string;type:string;device:'desktop'|'mobile';ratio?:number;onDevice:(device:'desktop'|'mobile')=>void;onChange:(value:string)=>void};
export function ImageCropEditor({source,value,type,device,ratio,onDevice,onChange}:Props){
 const baseline=defaultImageCrop(type,source),settings=parseImageCrop(value)??baseline,current=device==='mobile'?(settings.mobile??settings.desktop):settings.desktop;
 const drag=useRef<{id:number;x:number;y:number;crop:ImageCrop;overflowX:number;overflowY:number}|null>(null);
 const clamp=(v:number,min:number,max:number)=>Math.min(max,Math.max(min,v));
 function update(next:ImageCrop){onChange(JSON.stringify({...settings,[device]:next,...(device==='desktop'&&!settings.mobile?{mobile:baseline.mobile}:{} )}));}
 function start(e:PointerEvent<HTMLDivElement>){
  if(e.button!==0)return;const img=e.currentTarget.querySelector('img');if(!img?.naturalWidth)return;
  const r=e.currentTarget.getBoundingClientRect(),scale=Math.max(r.width/img.naturalWidth,r.height/img.naturalHeight)*current.zoom;
  drag.current={id:e.pointerId,x:e.clientX,y:e.clientY,crop:current,overflowX:img.naturalWidth*scale-r.width,overflowY:img.naturalHeight*scale-r.height};e.currentTarget.setPointerCapture(e.pointerId);
 }
 function move(e:PointerEvent<HTMLDivElement>){const d=drag.current;if(!d||d.id!==e.pointerId)return;update({...d.crop,x:d.overflowX>1?clamp(d.crop.x-(e.clientX-d.x)*100/d.overflowX,0,100):d.crop.x,y:d.overflowY>1?clamp(d.crop.y-(e.clientY-d.y)*100/d.overflowY,0,100):d.crop.y});}
 return <details className={styles.panel} open={type==='product'?true:undefined}><summary>Настроить кадр</summary><div className={styles.devices}><button type="button" aria-pressed={device==='desktop'} onClick={()=>onDevice('desktop')}>Компьютер</button><button type="button" aria-pressed={device==='mobile'} onClick={()=>onDevice('mobile')}>Телефон</button></div>
  <div className={styles.frame} style={{aspectRatio:ratio??cropReferenceRatio(type,device==='mobile')}} onPointerDown={start} onPointerMove={move} onPointerUp={()=>drag.current=null} onPointerCancel={()=>drag.current=null} onLostPointerCapture={()=>drag.current=null}>
   <CroppedImage unoptimized fill draggable={false} alt="Предпросмотр кадрирования" sizes="300px" src={source.startsWith('/')?assetPath(source):source} defaultCrop={{desktop:current,mobile:current}}/>
  </div><small className={styles.hint}>Перетаскивайте фото или используйте ползунки. Оригинал сохранится. Компьютер и телефон настраиваются отдельно.</small>
  <div className={styles.controls}>{([{key:'zoom',label:'Масштаб',min:1,max:5,step:.01},{key:'x',label:'По горизонтали',min:0,max:100,step:.1},{key:'y',label:'По вертикали',min:0,max:100,step:.1}] as const).map(f=><label className={styles.control} key={f.key}><span>{f.label}</span><output>{f.key==='zoom'?current.zoom.toFixed(2)+'×':Math.round(current[f.key])+'%'}</output><input type="range" aria-label={f.label} min={f.min} max={f.max} step={f.step} value={current[f.key]} onChange={e=>update({...current,[f.key]:Number(e.target.value)})}/></label>)}</div>
  <button type="button" className={styles.reset} onClick={()=>update(device==='mobile'?(baseline.mobile??baseline.desktop):baseline.desktop)}>Сбросить кадр для этого экрана</button><small className={styles.hint}>Кадр попадёт на сайт после сохранения черновика и публикации.</small>
 </details>;
}
