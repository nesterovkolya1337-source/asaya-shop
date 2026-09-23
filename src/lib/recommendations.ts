import type {Product,ProductCategory} from './store-data';
// The same selection is used by PDP, cart and the Admin preview.
export function selectRecommendations(products:Product[],excluded:string[],legacy:string[]=[],cartIds:string[]=[]){
 const candidates=products.filter(p=>p.active&&p.sku&&!excluded.includes(p.id)&&!cartIds.includes(p.id)&&p.stock>0&&p.stockState!=='unknown');
 const selected:Product[]=[];
 const add=(p:Product|undefined)=>{if(p&&!selected.some(x=>x.id===p.id))selected.push(p);};
 const sources=excluded.map(id=>products.find(p=>p.id===id)).filter((p):p is Product=>!!p);
 const manual=sources.some(p=>p.merchandising)?sources.map(p=>p.merchandising?.prioritySku):legacy;
 for(const sku of manual){if(selected.length===4)break;add(candidates.find(p=>p.sku===sku||p.id===sku));}
 const rank=(p:Product)=>p.merchandising?.catalogOrder??p.placement?.catalogOrder??100000;
 const ordered=[...candidates].sort((a,b)=>(b.merchandising?.soldUnits??0)-(a.merchandising?.soldUnits??0)||(rank(a)<0?100000:rank(a))-(rank(b)<0?100000:rank(b))||a.id.localeCompare(b.id));
 for(const p of ordered.filter(p=>(p.merchandising?.soldUnits??0)>0)){if(selected.length===4)break;add(p);}
 for(const c of ['body','hair','face','sets']){if(selected.length===4)break;if(!selected.some(p=>p.category===c))add(ordered.find(p=>p.category===c&&!selected.includes(p)));}
 const categories=[...new Set(sources.map(p=>p.category))];categories.sort((a,b)=>sources.filter(p=>p.category===b).length-sources.filter(p=>p.category===a).length);
 for(const c of [...categories,...(['body','hair','face','sets'] as ProductCategory[]).filter(c=>!categories.includes(c))])for(const p of ordered.filter(p=>p.category===c)){if(selected.length<4)add(p);}
 for(const p of ordered)add(p);
 return selected;
}
