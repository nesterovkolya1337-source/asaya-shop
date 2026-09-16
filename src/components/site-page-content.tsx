"use client";
import {Fragment} from 'react';
import {CroppedImage} from './cropped-image';
import {defaultImageCrop,type ResponsiveImageCrop} from '../../backend/src/image-crop';
import Link from 'next/link';
import {assetPath} from '@/lib/asset-path';
import {sitePages,type SitePageId,type SiteBlock} from '@/lib/site-content-client';
import {useSiteDocument} from './site-content-provider';
import {InstructionsGrid} from '@/app/instructions/instructions-grid';
import {SiteChrome,SiteFooter} from './site-shell';
import {ProductRail} from './product-rail';
import {CommunityCarousel} from './community-carousel';
import home from '@/app/page.module.css';
import about from '@/app/about/about.module.css';
import faq from '@/app/faq/faq.module.css';
import stores from '@/app/where-to-buy/where-to-buy.module.css';
import info from './info-page.module.css';
import styles from './site-page-content.module.css';
import legal from '@/app/legal/[slug]/legal.module.css';
const legalPage=(id:SitePageId)=>['privacy','personal-data','offer'].includes(id);
const imageUrl=(src:string)=>src.startsWith('/')?assetPath(src):src;
function Photo({src,alt,className,priority=false,crop,defaultCrop}:{src:string;alt:string;className?:string;priority?:boolean;crop?:string;defaultCrop?:ResponsiveImageCrop}){
 return src?<CroppedImage unoptimized src={imageUrl(src)} alt={alt} className={className} fill priority={priority} crop={crop} defaultCrop={defaultCrop} sizes="(max-width: 760px) 94vw, 1440px"/>:<div className={styles.emptyImage}>Выберите изображение</div>;
}
function Button({v,className}:{v:Record<string,string>;className?:string}){
 if(!v.href||!v.buttonText)return null;
 return v.href.startsWith('/')?<Link className={className} href={v.href}>{v.buttonText}</Link>:<a className={className} href={v.href} rel="noreferrer" target={v.href.startsWith('https:')?'_blank':undefined}>{v.buttonText}</a>;
}
function DocumentParagraphs({text}:{text:string}){
 const groups:Array<{list:boolean;paragraphs:string[]}>=[];
 for(const paragraph of text.split('\n\n').filter(Boolean)){
  const list=paragraph.startsWith('• '),value=list?paragraph.slice(2):paragraph;
  if(list&&groups.at(-1)?.list)groups.at(-1)!.paragraphs.push(value);
  else groups.push({list,paragraphs:[value]});
 }
 return groups.map((group,i)=>group.list?<ul key={i}>{group.paragraphs.map((p,j)=><li key={j}>{p}</li>)}</ul>:<p key={i}>{group.paragraphs[0]}</p>);
}
function Block({b,pageId,first}:{b:SiteBlock;pageId:SitePageId;first:boolean}){
 const v=b.values,Title=first?'h1':'h2',key='site-'+b.id;
 switch(b.type){
  case 'homeHero':return <section className={home.hero} data-site-hero><Photo src={v.image} alt={v.alt} className={home.heroImage} priority={first} crop={v.imageCrop}/><div className={home.heroCopy}><p>{v.eyebrow}</p><Title>{v.title}</Title><Button v={v} className={home.lightButton}/></div></section>;
  case 'products':return <section className={home.products} aria-label={v.title}><h2 className={home.srTitle}>{v.title}</h2><ProductRail/></section>;
  case 'manifesto':return <section className={home.manifesto}><Photo src={v.image} alt={v.alt} className={home.manifestoImage} crop={v.imageCrop} defaultCrop={defaultImageCrop('manifesto',v.image)}/><div className={home.manifestoCopy}><h2>{v.title}</h2><p className={styles.text}>{v.text}</p><Button v={v} className={home.aboutButton}/></div></section>;
  case 'categories':return <section className={home.categoryGrid} aria-label={v.title}>{b.items.map((item,i)=><Link className={home.categoryCard} href={item.href||'/catalog'} key={i}><CroppedImage unoptimized alt={item.alt||item.title} className={`${home.categoryImage} ${home[['hair','body','face'][i%3]]}`} height={2700} width={1800} crop={item.imageCrop} sizes="(max-width: 760px) 92vw, 370px" src={imageUrl(item.image||'/images/figma/asaya-6205.webp')}/><span>{item.title}</span></Link>)}</section>;
  case 'gallery':return <section className={home.community} aria-labelledby={key}><CommunityCarousel photos={b.items.filter(i=>i.image).map(i=>({image:imageUrl(i.image),alt:i.alt,crop:i.imageCrop}))} titleId={key} title={v.title}/></section>;
  case 'aboutHero':return <section className={about.hero}><div className={about.heroCopy}><p>{v.eyebrow}</p><Title>{v.title}</Title><span className={styles.text}>{v.text}</span><Button v={v}/></div><div className={about.heroVisual}><Photo src={v.image} alt={v.alt} priority={first} crop={v.imageCrop}/></div></section>;
  case 'statement':return <section className={about.statement}><p>{v.eyebrow}</p><h2>{v.title}</h2></section>;
  case 'moods':return <section className={about.moods} aria-labelledby={key}><header><p>{v.eyebrow}</p><h2 id={key}>{v.title}</h2><span className={styles.text}>{v.text}</span></header><div className={about.moodGrid}>{b.items.map((item,i)=><article className={`${about.moodCard} ${about[['relaxation','sensuality','confidence','freedom','change','individuality'][i%6]]}`} key={i}><div className={about.moodCopy}><span>{String(i+1).padStart(2,'0')}</span><p>{item.title}</p><h3>{item.text}</h3></div></article>)}</div></section>;
  case 'story':return <section className={about.story}>{b.items.map((item,i)=><Fragment key={i}><article className={i===1?about.pink:undefined}><span>{String(i+1).padStart(2,'0')}</span><h2>{item.title}</h2><p className={styles.text}>{item.text}</p></article>{i===0&&<div className={about.storyImage}><Photo src={v.image} alt={v.alt} crop={v.imageCrop}/></div>}</Fragment>)}</section>;
  case 'formula':return <section className={about.formula}><p>{v.eyebrow}</p><h2>{v.title.split(' + ').map((t,i)=><Fragment key={i}>{i>0&&<> <span>+</span> </>}{t}</Fragment>)}</h2><div>{b.items.map((item,i)=><strong key={i}>{item.text}</strong>)}</div></section>;
  case 'heading':{const s=pageId==='faq'?faq:pageId==='where-to-buy'?stores:legalPage(pageId)?legal:info;return <header className={s.heading}><p>{v.eyebrow}</p><Title>{v.title}</Title><span className={styles.text}>{v.text}</span><Button v={v}/></header>;}
  case 'questions':return <section className={faq.questions} aria-label={v.title}>{b.items.map((item,i)=><details key={i}><summary>{item.title}<span>+</span></summary><p className={styles.text}>{item.text}</p></details>)}</section>;
  case 'contact':return <div className={faq.contact}><span>{v.title}</span><Button v={v}/></div>;
  case 'stores':return <><section className={stores.grid} aria-label={v.title}>{b.items.map((item,i)=><article key={i} className={i===0?stores.primary:undefined}><span>{String(i+1).padStart(2,'0')}</span><p>{item.text}</p><h2>{item.title}</h2><Button v={item}/></article>)}</section><p className={stores.notice}>{v.text}</p></>;
  case 'infoCards':return <section className={info.grid} aria-label={v.title}>{b.items.map((item,i)=><article key={i}><span>{String(i+1).padStart(2,'0')}</span><h2>{item.title}</h2><p className={styles.text}>{item.text}</p><Button v={item} className={styles.infoLink}/></article>)}</section>;
  case 'documentNotice':return <aside className={styles.documentNotice}><strong>{v.title}</strong><span className={styles.text}>{v.text}</span></aside>;
  case 'documentSections':return legalPage(pageId)?<section className={styles.legalSections} aria-label={v.title}>{b.items.map((item,i)=><div key={i}><h2>{item.title}</h2><DocumentParagraphs text={item.text}/><Button v={item} className={styles.infoLink}/></div>)}</section>:<section className={styles.documentSections} aria-label={v.title}>{b.items.map((item,i)=><article key={i} className={styles.documentSection}><span>{String(i+1).padStart(2,'0')}</span><h2>{item.title}</h2><div><p className={styles.text}>{item.text}</p><Button v={item} className={styles.infoLink}/></div></article>)}</section>;
  case 'documentTable':return <div className={styles.legalTable}><table aria-label={v.title}><thead><tr><th scope="col">{b.items[0]?.title}</th><th scope="col">{b.items[0]?.text}</th></tr></thead><tbody>{b.items.slice(1).map((item,i)=><tr key={i}><th scope="row">{item.title}</th><td>{item.text}</td></tr>)}</tbody></table></div>;
  case 'instructionList':return <section aria-label={v.title}><InstructionsGrid/></section>;
 }
}
export function SitePageContent({id}:{id:SitePageId}){
 const {page,attrs,preview}=useSiteDocument(id);
 const blocks=page.blocks.filter(b=>b.visible),s=id==='home'?home:id==='about'?about:id==='faq'?faq:id==='where-to-buy'?stores:legalPage(id)?legal:info;
 return <><div className={s.page}><SiteChrome overlay={blocks[0]?.type==='homeHero'}/><main>{!['homeHero','aboutHero','heading'].includes(blocks[0]?.type??'')&&<h1 className={styles.fallbackHeading}>{sitePages.find(p=>p.id===id)!.name}</h1>}{blocks.map((b,i)=><div key={b.id} className={preview?styles.previewBlock:styles.contents} {...attrs(b)}><Block b={b} pageId={id} first={i===0}/></div>)}</main></div><SiteFooter/></>;
}
