import type { Product } from './store-data';

type CatalogItem = {sku:string;name?:string;content?:unknown;slug:string;currency:'RUB';regularMinor:number;finalMinor:number;available:number};
export type ProductContent=Pick<Product,'description'|'volume'|'category'|'usage'|'ingredients'|'aroma'|'features'|'image'|'gallery'|'badge'|'instruction'|'recommendations'|'sensory'> & {placement?:Product['placement'];safety:string;setKind:'none'|'combo'|'gift'};
export function parseProductContent(raw:unknown):ProductContent {
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('INVALID_CONTENT');
 const c=raw as ProductContent;
 if(!['description','volume','usage','ingredients','aroma','image','badge','safety'].every(k=>typeof (raw as Record<string,unknown>)[k]==='string')||
  !['hair','body','face','sets'].includes(c.category)||!['none','combo','gift'].includes(c.setKind)||
  !['features','gallery','recommendations'].every(k=>Array.isArray((raw as Record<string,unknown>)[k])&&((raw as Record<string,unknown>)[k] as unknown[]).every(v=>typeof v==='string'))||
  !c.instruction||!Array.isArray(c.instruction.steps)||!c.instruction.steps.every(v=>typeof v==='string')||typeof c.instruction.amount!=='string'||typeof c.instruction.tip!=='string'||
  !Array.isArray(c.sensory)||!c.sensory.every(v=>v&&typeof v.label==='string'&&Number.isInteger(v.value)&&v.value>=0&&v.value<=5))throw new Error('INVALID_CONTENT');
 if(c.placement!==undefined){const p=c.placement;if(!p||typeof p!=='object'||Array.isArray(p)||!Number.isInteger(p.catalogOrder)||p.catalogOrder<0||p.catalogOrder>100000||![p.bestsellerOrder,p.newOrder].every(v=>v===null||Number.isInteger(v)&&v>=0&&v<=100000))throw new Error('INVALID_CONTENT');}
 const safeImage=(v:string)=>v===''||/^\/api\/store\/v1\/media\/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v)||/^\/images\/[A-Za-z0-9_./-]+$/.test(v)&&!v.includes('..')||/^https:\/\/[^\s]+$/.test(v)&&(()=>{try{const u=new URL(v);return !u.username&&!u.password;}catch{return false;}})();
 if(![c.image,...c.gallery].every(safeImage))throw new Error('INVALID_CONTENT');
 return {...(c.placement?{placement:{...c.placement}}:{}),description:c.description,volume:c.volume,category:c.category,setKind:c.setKind,usage:c.usage,ingredients:c.ingredients,aroma:c.aroma,
  features:c.features,image:c.image,gallery:c.gallery,badge:c.badge,instruction:c.instruction,safety:c.safety,recommendations:c.recommendations,sensory:c.sensory};
}
export function readBackendCatalog(payload:unknown,drafts:Product[]):Product[] {
 if(!payload || typeof payload!=='object' || !('items' in payload) || !Array.isArray(payload.items)) throw new Error('INVALID_CATALOG');
 const ids=new Set<string>();
 const skus=new Set<string>();
 return payload.items.map((raw:unknown)=>{
  if(!raw || typeof raw!=='object') throw new Error('INVALID_CATALOG');
  const item=raw as CatalogItem;
  if(typeof item.slug!=='string' || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(item.slug) || typeof item.sku!=='string' || !item.sku || item.currency!=='RUB' ||
   ![item.regularMinor,item.finalMinor,item.available].every(Number.isSafeInteger) || item.finalMinor<0 ||
   item.regularMinor<item.finalMinor || item.regularMinor>1_000_000_000_000 || item.available<0 ||
   ids.has(item.slug) || skus.has(item.sku)) throw new Error('INVALID_CATALOG');
  const draft=item.content?{...parseProductContent(item.content),id:item.slug,name:item.name}:drafts.find(product=>product.id===item.slug);
  if(item.content&&(!draft?.name||typeof draft.name!=='string'||!draft.image))throw new Error('INVALID_CATALOG');
  if(!draft) throw new Error('UNKNOWN_CATALOG_CARD');
  ids.add(item.slug);skus.add(item.sku);
  const displayImage=(path:string)=>(path.startsWith('/images/')||path.startsWith('/api/store/v1/media/'))?(process.env.NEXT_PUBLIC_BASE_PATH??'')+path:path;
  return {...draft,...(item.content?{image:displayImage(draft.image),gallery:draft.gallery.filter(Boolean).map(displayImage)}:{}),name:draft.name!,sku:item.sku,price:item.finalMinor/100,oldPrice:item.regularMinor/100,
   discount:item.regularMinor>0?Math.round((item.regularMinor-item.finalMinor)/item.regularMinor*100):0,
   stock:item.available,active:true,badge:item.content?draft.badge:'',rating:0,reviews:0};
 });
}
