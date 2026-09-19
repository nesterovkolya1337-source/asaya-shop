import {CroppedImage} from './cropped-image';
import {assetPath} from '@/lib/asset-path';
import type {PdpContent,PdpMedia,PdpSection} from '../../backend/src/pdp-content';
import styles from './pdp-sections.module.css';
export function hasPdpContent(s:PdpSection){return s.kind==='faq'?s.items.some(i=>i.title.trim()):s.kind==='howTo'?s.items.some(i=>i.title.trim()||i.body.trim()):!!(s.body.trim()||s.additionalBody.trim()||s.items.some(i=>i.title.trim()||i.body.trim()));}
function Media({items}:{items:PdpMedia[]}){
 if(!items.length)return null;
 return <div className={styles.media} data-count={items.length} data-composed={items.every(m=>m.layout)?true:undefined}>{items.map((m,i)=>{
 const frame=m.crop?undefined:m.frame;
 return <div key={i} style={m.layout?{position:'absolute',left:m.layout.x+'%',top:m.layout.y+'%',width:m.layout.width+'%',height:m.layout.height+'%',transform:`rotate(${m.layout.rotation}deg) scale(${m.layout.flipX?-1:1},${m.layout.flipY?-1:1})`}:undefined}>
 <div style={{position:'absolute',left:(frame?.x??0)+'%',top:(frame?.y??0)+'%',width:(frame?.width??100)+'%',height:(frame?.height??100)+'%'}}><CroppedImage alt="" crop={m.crop} fill sizes="(max-width:760px) 94vw,50vw" style={frame?{objectFit:'fill'}:undefined} src={m.src.startsWith('/')?assetPath(m.src):m.src}/></div></div>;
 })}</div>;
}
export function PdpSections({content}:{content:PdpContent}){
 return <div className={styles.sections} data-figma-node={content.node}>{content.sections.filter(hasPdpContent).map(s=>{
 const copy=<div className={styles.copy}><span className={styles.eyebrow}>{({result:'Результат',feature:'Эффект',ingredients:'Активные компоненты',fragrance:'Аромат',faq:'FAQ',howTo:'Как использовать',lifehack:'Лайфхак'})[s.kind]}</span>{s.title&&<h2>{s.title}</h2>}{s.body&&<p>{s.body}</p>}{s.kind==='faq'?<div>{s.items.filter(i=>i.title.trim()).map((i,n)=>i.body.trim()?<details key={n}><summary>{i.title}</summary><p>{i.body}</p></details>:<div className={styles.faqQuestion} key={n}><span>{i.title}</span><span aria-hidden="true">↗</span></div>)}</div>:s.items.length>0&&<ul>{s.items.filter(i=>i.title.trim()||i.body.trim()).map((i,n)=><li key={n}>{i.title&&<h3>{i.title}</h3>}{i.body&&<p>{i.body}</p>}</li>)}</ul>}{s.additionalBody&&<p className={styles.additional}>{s.additionalBody}</p>}</div>;
 if(s.kind==='howTo')return <section key={s.kind} className={styles.howTo}><h2>{s.title||'Как использовать'}</h2>{s.body&&<p>{s.body}</p>}<ol>{s.items.filter(i=>i.title.trim()||i.body.trim()).map((i,n)=><li key={n}>{i.media&&<Media items={[i.media]}/>}<div>{i.title&&<h3>{i.title}</h3>}{i.body&&<p>{i.body}</p>}</div></li>)}</ol>{s.additionalBody&&<p>{s.additionalBody}</p>}</section>;
 if(s.kind==='lifehack')return <section key={s.kind} className={styles.lifehack}>{copy}<Media items={s.media}/></section>;
 return <section key={s.kind} className={`${styles.block} ${styles[s.kind]} ${s.media.length?'':styles.noMedia}`}>{copy}<Media items={s.media}/></section>;
 })}</div>;
}
