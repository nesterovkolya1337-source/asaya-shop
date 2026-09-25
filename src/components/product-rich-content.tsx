'use client';
import {CroppedImage} from './cropped-image';
import type {PdpContent,PdpMedia} from '../../backend/src/pdp-content';
import {ingredientSegments,desktopSection} from '@/lib/rich-desktop-presentation';
import {richSections} from '@/lib/pdp-presentation';
import {assetPath} from '@/lib/asset-path';
import styles from './product-rich-content.module.css';
import {useSyncExternalStore,type CSSProperties} from 'react';
const subscribeDesktop=(notify:()=>void)=>{const m=matchMedia('(min-width:901px)');m.addEventListener('change',notify);return()=>m.removeEventListener('change',notify);};
const isDesktop=()=>matchMedia('(min-width:901px)').matches;
function Media({media,alt=''}:{media:PdpMedia;alt?:string}){return <div className={styles.image}><CroppedImage loading="lazy" src={media.src} crop={media.crop} alt={alt} fill sizes="(max-width: 900px) 94vw, 47vw"/></div>;}
function Visual({media,ratio=0.9}:{media:PdpMedia[];ratio?:number}){
 if(!media.some(m=>m.layout))return <div className={styles.visual}>{media.map((m,n)=><Media key={n} media={m}/>)}</div>;
 return <div className={styles.composition} style={{aspectRatio:ratio}}>{media.map((m,n)=>{
  const l=m.layout??{x:0,y:0,width:100,height:100,rotation:0,flipX:false,flipY:false};const f=m.frame??{x:0,y:0,width:100,height:100};
  return <div key={n} className={styles.photoLayer} style={{left:l.x+'%',top:l.y+'%',width:l.width+'%',height:l.height+'%',transform:`rotate(${l.rotation}deg) scale(${l.flipX?-1:1},${l.flipY?-1:1})`}}><CroppedImage loading="lazy" src={m.src} crop={m.crop} alt="" fill sizes={`(max-width: 900px) ${Math.min(94,(m.layout?.width??100)*0.9)}vw, ${Math.min(70,(m.layout?.width??100)*0.47)}vw`} style={m.crop?undefined:{right:'auto',bottom:'auto',left:f.x+'%',top:f.y+'%',width:f.width+'%',height:f.height+'%',objectFit:'cover'} as CSSProperties}/></div>;
 })}</div>;
}
export function ProductRichContent({content,sku=""}:{content?:PdpContent;sku?:string}){
 const desktop=useSyncExternalStore(subscribeDesktop,isDesktop,()=>false);
 const sections=richSections(content).map(s=>desktop?desktopSection(s,sku):s);if(!sections.length)return null;
 return <div className={styles.rich} data-rich-content>{sections.map(s=>{
 const items=s.items.filter(i=>s.kind==='faq'?i.title.trim()&&i.body.trim():i.title.trim()||i.body.trim()||i.media);
 const segmented=ingredientSegments(s);
 const heading=s.title.trim()?<h2 className={segmented?styles.legacyCopy:undefined}>{s.title}</h2>:null;
 const stop=s.body.indexOf('.');
 const copy=<>{s.eyebrow&&<p className={`${styles.eyebrow} ${segmented?styles.legacyCopy:''}`}>{s.eyebrow}</p>}{heading}{s.body.trim()&&<p className={segmented?styles.legacyCopy:undefined}>{s.kind==='feature'&&stop>=0?<><em className={styles.featureLead}>{s.body.slice(0,stop+1)}</em>{s.body.slice(stop+1)}</>:s.body}</p>}{s.additionalBody.trim()&&<p className={`${segmented?styles.legacyCopy:''} ${s.kind==='feature'?styles.featureResult:''}`}>{s.additionalBody.startsWith('Результат:')?<><strong>Результат:</strong>{s.additionalBody.slice(10)}</>:s.additionalBody}</p>}</>;
 if(s.kind==='faq')return <section key={s.kind} className={styles.faq} aria-label={s.title||'FAQ'}><div className={styles.faqCopy}>{copy}<div>{items.map((i,n)=><details key={n}><summary>{i.title}<img src={assetPath('/images/figma/pdp-rich/expand.svg')} alt="" width={24} height={24}/></summary><div className={styles.answer}><p>{i.body}</p></div></details>)}</div></div>{s.media.length>0&&<Visual media={s.media} ratio={s.visualAspectRatio}/>}</section>;
 if(s.kind==='howTo')return <section key={s.kind} className={styles.howTo}>{copy}<div className={styles.steps}>{items.map((i,n)=><article key={n}>{(s.visualAspectRatio||items.some(item=>item.media))&&<div className={styles.stepMedia} style={{aspectRatio:s.visualAspectRatio??435/420}}>{i.media&&<Visual media={[i.media]} ratio={s.visualAspectRatio??435/420}/>}</div>}<div className={styles.stepCopy}>{i.title.trim()&&<h3>{i.title}</h3>}{i.body.trim()&&<p>{i.body}</p>}</div></article>)}</div>{s.media.length>0&&<div className={styles.steps}>{s.media.map((m,n)=><Media key={n} media={m}/>)}</div>}</section>;
 if(s.kind==='lifehack')return <section key={s.kind} className={styles.tip}>{copy}{items.map((i,n)=><div key={n}>{i.title&&<h3>{i.title}</h3>}{i.body&&<p>{i.body}</p>}{i.media&&<Media media={i.media}/>}</div>)}{s.media.map((m,n)=><Media key={n} media={m}/>)}</section>;
 return <section key={s.kind} className={`${styles.panel} ${styles[s.kind]} ${s.kind==='ingredients'&&s.media.some(m=>m.layout)?styles.overlay:''} ${!s.media.length?styles.textOnly:''}`}><div className={styles.copy}>{copy}{segmented&&<div className={styles.segmentedCopy}><ul>{segmented.map(i=><li key={i.title}><h3>{i.title}</h3><p>{i.body}</p></li>)}</ul>{s.additionalBody.trim()&&<p>{s.additionalBody}</p>}</div>}{items.length>0&&<ul>{items.map((i,n)=><li key={n}>{i.title.trim()&&<h3>{i.title}</h3>}{i.body.trim()&&<p>{i.body}</p>}{i.media&&<Media media={i.media}/>}</li>)}</ul>}</div>{s.media.length>0&&<Visual media={s.media} ratio={s.visualAspectRatio}/>}</section>;
 })}</div>;
}
