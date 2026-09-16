// Pure content contract shared by the API and website. No server dependencies.
import {parseImageCrop} from './image-crop.ts';
export type SiteField = {key:string; label:string; kind:'text'|'long'|'image'|'link'; required?:boolean};
const field=(key:string,label:string,kind:SiteField['kind']='text',required=false):SiteField=>({key,label,kind,required});
const title=field('title','Заголовок','text',true),text=field('text','Текст','long');
const image=field('image','Изображение','image',true),alt=field('alt','Описание изображения');
const link=[field('buttonText','Текст кнопки'),field('href','Куда ведёт кнопка','link')];
const eyebrow=field('eyebrow','Подпись над заголовком');
export const blockTemplates = {
 homeHero:{label:'Главный баннер',fields:[eyebrow,title,image,alt,...link],items:[]},
 products:{label:'Подборка товаров',fields:[title],items:[]},
 manifesto:{label:'Баннер о бренде',fields:[title,text,image,alt,...link],items:[]},
 categories:{label:'Категории каталога',fields:[title],items:[title,image,alt,field('href','Ссылка','link',true)]},
 gallery:{label:'Фотогалерея',fields:[title],items:[image,alt]},
 aboutHero:{label:'О бренде: первый экран',fields:[eyebrow,title,text,image,alt,...link],items:[]},
 statement:{label:'Крупный текст',fields:[eyebrow,title],items:[]},
 moods:{label:'Карточки настроений',fields:[eyebrow,title,text],items:[title,text]},
 story:{label:'История бренда',fields:[image,alt],items:[title,text]},
 formula:{label:'Формула бренда',fields:[eyebrow,title],items:[text]},
 heading:{label:'Заголовок страницы',fields:[eyebrow,title,text,...link],items:[]},
 questions:{label:'Вопросы и ответы',fields:[title],items:[field('title','Вопрос','text',true),field('text','Ответ','long',true)]},
 contact:{label:'Кнопка связи',fields:[title,...link],items:[]},
 stores:{label:'Площадки продаж',fields:[title,text],items:[title,text,field('href','Ссылка','link',true),field('buttonText','Текст ссылки')]},
 infoCards:{label:'Информационные карточки',fields:[title],items:[title,text,field('href','Ссылка','link'),field('buttonText','Текст ссылки')]},
 documentNotice:{label:'Примечание к документу',fields:[title,text],items:[]},
 documentSections:{label:'Разделы документа',fields:[title],items:[title,text,...link]},
 documentTable:{label:'Таблица документа',fields:[title],items:[title,text]},
 instructionList:{label:'Инструкции по товарам',fields:[title],items:[]},
 siteAnnouncement:{label:'Полоса над меню',fields:[field('text','Текст объявления','text',true),field('href','Ссылка (необязательно)','link')],items:[]},
 siteBrand:{label:'Логотип',fields:[image,field('alt','Название бренда','text',true)],items:[]},
 siteNavigation:{label:'Ссылки в шапке',fields:[],items:[title,field('href','Ссылка','link',true)]},
 siteMenu:{label:'Раскрывающееся меню',fields:[],items:[title,field('href','Ссылка','link',true)]},
 siteSocial:{label:'Социальные сети',fields:[eyebrow,title],items:[title,field('href','Ссылка','link',true)]},
 footerLinks:{label:'Колонка ссылок в подвале',fields:[title],items:[title,field('href','Ссылка','link',true)]},
 siteLegal:{label:'Нижняя строка и документы',fields:[field('text','Подпись об авторских правах','text',true)],items:[title,field('href','Ссылка','link',true)]},
 siteHelp:{label:'Контакты службы заботы',fields:[field('buttonText','Надпись на кнопке','text',true),title,text],items:[title,field('href','Ссылка, почта или телефон','link',true)]},
} satisfies Record<string,{label:string;fields:SiteField[];items:SiteField[]}>;
export type BlockType=keyof typeof blockTemplates;
export type SiteBlock={id:string;type:BlockType;visible:boolean;values:Record<string,string>;items:Record<string,string>[]};
export const sitePages=[{id:'header',name:'Шапка и меню',path:'/'},{id:'footer',name:'Подвал и контакты',path:'/'},{id:'home',name:'Главная',path:'/'},{id:'about',name:'О бренде',path:'/about/'},{id:'faq',name:'Вопросы и ответы',path:'/faq/'},{id:'delivery',name:'Доставка и оплата',path:'/delivery/'},{id:'support',name:'Служба заботы',path:'/support/'},{id:'where-to-buy',name:'Где купить',path:'/where-to-buy/'},{id:'returns',name:'Возврат и претензии',path:'/returns/'},{id:'requisites',name:'Реквизиты',path:'/requisites/'},{id:'instructions',name:'Инструкции',path:'/instructions/'},{id:'privacy',name:'Политика конфиденциальности',path:'/legal/privacy/'},{id:'personal-data',name:'Согласие на обработку данных',path:'/legal/personal-data/'},{id:'offer',name:'Публичная оферта',path:'/legal/offer/'}] as const;
export type SitePageId=typeof sitePages[number]['id'];
export type SitePage={id:SitePageId;blocks:SiteBlock[]};
export const isSharedPage=(id:SitePageId)=>id==='header'||id==='footer';
const headerTypes:BlockType[]=['siteAnnouncement','siteBrand','siteNavigation','siteMenu'];
const footerTypes:BlockType[]=['siteBrand','siteSocial','footerLinks','siteLegal','siteHelp'];
export function allowedBlockTypes(id:SitePageId):BlockType[]{
 if(id==='header')return headerTypes;
 if(id==='footer')return footerTypes;
 return (Object.keys(blockTemplates) as BlockType[]).filter(t=>!headerTypes.includes(t)&&!footerTypes.includes(t));
}
const object=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v))throw new Error('INVALID_SITE_CONTENT');return v as Record<string,unknown>;};
export function isSiteImage(v:string){
 if(v==='')return true;
 if(/^\/images\/[A-Za-z0-9_./-]+$/.test(v)&&!v.includes('..'))return true;
 if(/^\/api\/store\/v1\/media\/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v))return true;
 try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password&&!/\s|\\/.test(v);}catch{return false;}
}
export function isSiteLink(v:string){
 if(!v)return true;
 if(/^\/(?!\/)[A-Za-z0-9/?#&=._%~-]*$/.test(v)&&!v.includes('..')&&!/%(?:2f|5c|0[ad])/i.test(v))return true;
 if(/^mailto:[A-Za-z0-9.!#$%&'*+\-/=?^_`{|}~]+@[A-Za-z0-9.-]+$/.test(v))return true;
 if(/^tel:\+?[0-9 ()-]{5,25}$/.test(v))return true;
 try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password&&!/\s|\\/.test(v);}catch{return false;}
}
function values(raw:unknown,fields:SiteField[]){
 const data=object(raw),result:Record<string,string>={};
 if(Object.keys(data).some(key=>!fields.some(f=>f.key===key||f.kind==='image'&&key===f.key+'Crop')))throw new Error('INVALID_SITE_CONTENT');
 for(const f of fields){const v=data[f.key]??'';if(typeof v!=='string'||v.length>(f.kind==='long'?10000:f.kind==='image'||f.kind==='link'?1000:500)||f.kind==='image'&&!isSiteImage(v)||f.kind==='link'&&!isSiteLink(v))throw new Error('INVALID_SITE_CONTENT');result[f.key]=v;}
 // Preserve the existing string-valued content contract. Each image may have a
 // strictly validated JSON companion; moving an item moves its settings too.
 for(const f of fields.filter(f=>f.kind==='image')){
  const key=f.key+'Crop',value=data[key];
  if(value===undefined||value==='')continue;
  if(typeof value!=='string')throw new Error('INVALID_SITE_CONTENT');
  const parsed=parseImageCrop(value);if(parsed)result[key]=JSON.stringify(parsed);
 }
 return result;
}
export function parseSitePage(raw:unknown):SitePage{
 const p=object(raw);
 if(Object.keys(p).some(k=>!['id','blocks'].includes(k))||!sitePages.some(v=>v.id===p.id)||!Array.isArray(p.blocks)||p.blocks.length<1||p.blocks.length>30)throw new Error('INVALID_SITE_CONTENT');
 const ids=new Set<string>();
 const blocks=p.blocks.map(rawBlock=>{
  const b=object(rawBlock);
  if(Object.keys(b).some(k=>!['id','type','visible','values','items'].includes(k))||typeof b.id!=='string'||!/^[-a-z0-9]{1,80}$/.test(b.id)||ids.has(b.id)||typeof b.type!=='string'||!Object.hasOwn(blockTemplates,b.type)||typeof b.visible!=='boolean'||!Array.isArray(b.items)||b.items.length>30)throw new Error('INVALID_SITE_CONTENT');
  ids.add(b.id);const type=b.type as BlockType,t=blockTemplates[type];
  if(!allowedBlockTypes(p.id as SitePageId).includes(type))throw new Error('INVALID_SITE_CONTENT');
  if(!t.items.length&&b.items.length)throw new Error('INVALID_SITE_CONTENT');
  return {id:b.id,type,visible:b.visible,values:values(b.values,t.fields),items:b.items.map(item=>values(item,t.items))};
 });
 if(isSharedPage(p.id as SitePageId)&&blocks.some((b,i)=>b.type!=='footerLinks'&&blocks.findIndex(other=>other.type===b.type)!==i))throw new Error('INVALID_SITE_CONTENT');
 if(p.id==='header'&&blocks.some(b=>b.type==='siteNavigation'&&b.items.length>3))throw new Error('INVALID_SITE_CONTENT');
 return {id:p.id as SitePageId,blocks};
}
export function sitePublicationIssues(page:SitePage){
 const issues:string[]=[];
 if(!page.blocks.some(b=>b.visible))issues.push('Оставьте хотя бы один видимый блок.');
 if(isSharedPage(page.id)&&!page.blocks.some(b=>b.type==='siteBrand'&&b.visible))issues.push('Оставьте видимый логотип бренда.');
 if(page.id==='header'&&!page.blocks.some(b=>b.type==='siteMenu'&&b.visible))issues.push('Оставьте доступным меню сайта.');
 for(const b of page.blocks.filter(b=>b.visible)){
  const t=blockTemplates[b.type];
  for(const [data,fields,label] of [[b.values,t.fields,t.label],...b.items.map((v,i)=>[v,t.items,`${t.label}, карточка ${i+1}`])] as Array<[Record<string,string>,SiteField[],string]>){
   for(const f of fields)if(f.required&&!data[f.key]?.trim())issues.push(`${label}: заполните «${f.label}».`);
   if(fields.some(f=>f.key==='buttonText')&&fields.some(f=>f.key==='href')&&Boolean(data.buttonText?.trim())!==Boolean(data.href?.trim()))issues.push(`${label}: укажите текст и ссылку кнопки вместе.`);
  }
  if(t.items.length&&!b.items.length)issues.push(`${t.label}: добавьте хотя бы один пункт.`);
 }
 return issues;
}
