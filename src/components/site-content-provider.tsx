"use client";
import {createContext,useCallback,useContext,useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {assetPath} from '@/lib/asset-path';
import {parseSitePage,sitePageDefaults,sitePages,blockTemplates,type SitePageId,type SitePage,type SiteBlock} from '@/lib/site-content-client';

type ContentContext={documents:Partial<Record<SitePageId,SitePage>>;draft:SitePage|null;selected:string;preview:boolean;load:(id:SitePageId)=>void};
const Context=createContext<ContentContext|null>(null);
const enabled=process.env.NEXT_PUBLIC_CATALOG_SOURCE==='backend'||process.env.NEXT_PUBLIC_SITE_CONTENT==='backend';

export function SiteContentProvider({children}:{children:ReactNode}){
 const [documents,setDocuments]=useState<ContentContext['documents']>({}),[draft,setDraft]=useState<SitePage|null>(null),[selected,setSelected]=useState('');
 const requested=useRef(new Set<SitePageId>()),mounted=useRef(true),current=useRef<{draft:SitePage|null;selected:string}>({draft:null,selected:''});
 const load=useCallback((id:SitePageId)=>{
  if(!enabled||requested.current.has(id))return;
  requested.current.add(id);const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),8000);
  void fetch(assetPath('/api/store/v1/content/'+id),{signal:controller.signal,cache:'no-store',credentials:'omit'})
   .then(async r=>{if(!r.ok)throw Error('Content unavailable');return r.json();})
   .then(r=>{if(!r.page)return;const page=parseSitePage(r.page);if(page.id===id&&mounted.current)setDocuments(previous=>({...previous,[id]:page}));})
   .catch(()=>{/* Keep the original site when the content API is unavailable. */}).finally(()=>clearTimeout(timeout));
 },[]);
 useEffect(()=>{
  mounted.current=true;
  const framed=window.parent!==window&&new URLSearchParams(window.location.search).get('asaya-preview')==='1';
  const receive=(event:MessageEvent)=>{
   if(!framed||event.source!==window.parent||event.origin!==window.location.origin||event.data?.type!=='asaya:preview-content')return;
   try{
    const page=parseSitePage(event.data.page),id=typeof event.data.selected==='string'&&page.blocks.some(b=>b.id===event.data.selected)?event.data.selected:'';
    current.current={draft:page,selected:id};setDraft(page);setSelected(id);
   }catch{/* Ignore malformed preview data without replacing the visible document. */}
  };
  const select=(event:MouseEvent)=>{
   if(!framed||!current.current.draft)return;
   const element=event.target instanceof Element?event.target:null;
   const region=element?.closest<HTMLElement>('[data-site-page][data-site-block]');
   if(region&&sitePages.some(p=>p.id===region.dataset.sitePage))window.parent.postMessage({type:'asaya:select-block',pageId:region.dataset.sitePage,id:region.dataset.siteBlock},window.location.origin);
   // Navigation and purchases in the preview must not perform real actions.
   // Details and explicitly marked local controls remain usable for inspecting menus.
   if(element?.closest('summary,[data-preview-interactive]'))return;
   event.preventDefault();event.stopPropagation();
  };
  const preventSubmit=(event:SubmitEvent)=>{if(framed&&current.current.draft){event.preventDefault();event.stopPropagation();}};
  window.addEventListener('message',receive);document.addEventListener('click',select,true);document.addEventListener('submit',preventSubmit,true);
  if(framed)window.parent.postMessage({type:'asaya:preview-ready'},window.location.origin);
  return()=>{mounted.current=false;window.removeEventListener('message',receive);document.removeEventListener('click',select,true);document.removeEventListener('submit',preventSubmit,true);};
 },[]);
 useEffect(()=>{
  if(!draft)return;
  const regions=Array.from(document.querySelectorAll<HTMLElement>('[data-site-page][data-site-block]')).filter(e=>e.dataset.sitePage===draft.id);
  const report=()=>{
   const ratios:Record<string,number>={};
   for(const region of regions)region.querySelectorAll<HTMLImageElement>('img[data-site-image]').forEach((img,i)=>{
    const r=img.parentElement?.getBoundingClientRect();if(r&&r.height>0&&r.width>0)ratios[region.dataset.siteBlock+':'+i]=r.width/r.height;
   });
   window.parent.postMessage({type:'asaya:preview-images',pageId:draft.id,width:window.innerWidth,ratios},window.location.origin);
  };
  const observer=new ResizeObserver(report);for(const region of regions)for(const img of region.querySelectorAll('img[data-site-image]'))if(img.parentElement)observer.observe(img.parentElement);
  report();return()=>observer.disconnect();
 },[draft]);
 const draftId=draft?.id;
 useEffect(()=>{
  if(!draftId||!selected)return;
  const target=Array.from(document.querySelectorAll<HTMLElement>('[data-site-page][data-site-block]')).find(node=>node.dataset.sitePage===draftId&&node.dataset.siteBlock===selected);
  if(target){const rect=target.getBoundingClientRect();if(rect.top<0||rect.top>window.innerHeight*.6)window.scrollTo({top:Math.max(0,window.scrollY+rect.top-90),behavior:'smooth'});}
 },[draftId,selected]);
 const value=useMemo(()=>({documents,draft,selected,preview:draft!==null,load}),[documents,draft,selected,load]);
 return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useSiteDocument(id:SitePageId){
 const context=useContext(Context);
 if(!context)throw Error('SiteContentProvider is required');
 const {load,documents,draft,selected,preview}=context;
 useEffect(()=>{load(id);},[load,id]);
 const page=draft?.id===id?draft:documents[id]??sitePageDefaults[id];
 const attrs=(block:SiteBlock)=>({'data-site-page':id,'data-site-block':block.id,'data-label':blockTemplates[block.type].label,
  'data-site-editable':preview,'data-selected':draft?.id===id&&selected===block.id});
 return {page,preview,isDefault:draft?.id!==id&&!documents[id],attrs};
}
