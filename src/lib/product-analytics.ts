import {readCookieChoice} from './analytics-consent.ts';
import {assetPath} from './asset-path.ts';
export type ProductEvent='product_impression'|'product_open'|'product_click'|'add_to_cart'|'checkout_started';
type Event={eventId:string;type:ProductEvent;sku:string};
type State={id:string;expires:number;seen:string[];pending:Event[]};
export const PRODUCT_ANALYTICS_KEY='asaya-product-analytics-v1';
const uuidPattern=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const types=new Set(['product_impression','product_open','product_click','add_to_cart','checkout_started']);
export function createProductAnalytics(options:{storage:Pick<Storage,'getItem'|'setItem'|'removeItem'>;uuid:()=>string;now:()=>number;allowed:()=>boolean;enabled?:()=>boolean;send:(payload:{anonymousSessionId:string;events:Event[]})=>Promise<boolean>}){
 let state:State|undefined,running:Promise<void>|undefined;
 const persist=()=>{try{if(state)options.storage.setItem(PRODUCT_ANALYTICS_KEY,JSON.stringify(state));}catch{/* In-memory state still deduplicates. */}};
 const session=()=>{
  if(!state){try{const raw=JSON.parse(options.storage.getItem(PRODUCT_ANALYTICS_KEY)??'null');
   if(raw&&uuidPattern.test(raw.id)&&Number.isFinite(raw.expires)&&raw.expires>options.now()&&raw.expires<=options.now()+1800000&&Array.isArray(raw.seen)&&raw.seen.length<=500&&raw.seen.every((k:unknown)=>typeof k==='string'&&k.length<=130)&&Array.isArray(raw.pending)&&raw.pending.length<=500&&raw.pending.every((e:Event)=>e&&uuidPattern.test(e.eventId)&&types.has(e.type)&&typeof e.sku==='string'&&e.sku.length>0&&e.sku.length<=100))state={id:raw.id,expires:raw.expires,seen:raw.seen,pending:raw.pending.map((e:Event)=>({eventId:e.eventId,type:e.type,sku:e.sku}))};
  }catch{/* Invalid/expired client state never reaches the collector. */}}
  if(!state||state.expires<=options.now())state={id:options.uuid(),expires:options.now()+1800000,seen:[],pending:[]};
  return state;
 };
 const stop=()=>{state=undefined;try{options.storage.removeItem(PRODUCT_ANALYTICS_KEY);}catch{}};
 const flush=()=>{
  if(!options.allowed()){stop();return Promise.resolve();}
  if(options.enabled?.()===false)return Promise.resolve();
  if(running)return running;
  const current=session();
  if(!current.pending.length)return Promise.resolve();
  running=(async()=>{let requests=0;while(current===state&&options.allowed()&&options.enabled?.()!==false&&current.pending.length&&requests++<25){
   const batch=current.pending.slice(0,20);let ok=false;
   try{ok=await options.send({anonymousSessionId:current.id,events:batch});}catch{/* Retry the same IDs on the next action/page. */}
   if(!ok||current!==state||!options.allowed())break;
   const ids=new Set(batch.map(e=>e.eventId));current.pending=current.pending.filter(e=>!ids.has(e.eventId));persist();
  }})().finally(()=>{running=undefined;if(state&&state!==current&&state.pending.length&&options.allowed())void flush();});
  return running;
 };
 return {stop,flush,track(type:ProductEvent,sku?:string){
  if(!options.allowed()){stop();return false;}
  if(options.enabled?.()===false)return false;
  if(!sku||sku.length>100||!types.has(type))return false;
  const current=session(),key=type+':'+sku;
  if(current.seen.includes(key)){void flush();return false;}
  if(current.seen.length>=500)return false;
  current.seen.push(key);current.pending.push({eventId:options.uuid(),type,sku});persist();void flush();return true;
 }};
}
let runtime:ReturnType<typeof createProductAnalytics>|undefined;
export function getProductAnalytics(){
 if(typeof window==='undefined')return undefined;
 return runtime??=createProductAnalytics({storage:{getItem:k=>window.sessionStorage.getItem(k),setItem:(k,v)=>window.sessionStorage.setItem(k,v),removeItem:k=>window.sessionStorage.removeItem(k)},uuid:()=>crypto.randomUUID(),now:()=>Date.now(),
  allowed:()=>readCookieChoice()==='analytics',
  enabled:()=>process.env.NEXT_PUBLIC_CATALOG_SOURCE!=='demo'&&window.top===window.self&&!/^\/(manage|admin|account|checkout|order-status|api)(\/|$)/i.test(window.location.pathname)&&!new URLSearchParams(window.location.search).has('asaya-preview'),
  send:async payload=>(await fetch(assetPath('/api/store/v1/analytics/events'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store',keepalive:true,signal:AbortSignal.timeout(2000)})).ok});
}

// Continuous visibility, not accumulated scroll fragments; hidden tabs do not qualify.
export function observeProductImpression(element:Element,emit:()=>void,environment:{observer:typeof IntersectionObserver;document:Pick<Document,'hidden'|'addEventListener'|'removeEventListener'>;setTimeout:typeof setTimeout;clearTimeout:typeof clearTimeout}={observer:IntersectionObserver,document,setTimeout:setTimeout.bind(globalThis),clearTimeout:clearTimeout.bind(globalThis)}){
 let visible=false,fired=false,disposed=false,timer:ReturnType<typeof setTimeout>|undefined;
 const reset=()=>{if(timer!==undefined)environment.clearTimeout(timer);timer=undefined;};
 const update=()=>{reset();if(visible&&!environment.document.hidden&&!fired&&!disposed)timer=environment.setTimeout(()=>{timer=undefined;if(visible&&!environment.document.hidden&&!disposed&&!fired){fired=true;emit();}},1000);};
 const observer=new environment.observer(entries=>{for(const entry of entries)if(entry.target===element){const next=entry.isIntersecting&&entry.intersectionRatio>=.5;if(next!==visible){visible=next;update();}}},{threshold:[0,.5,1]});
 observer.observe(element);environment.document.addEventListener('visibilitychange',update);
 return()=>{disposed=true;reset();observer.disconnect();environment.document.removeEventListener('visibilitychange',update);};
}
