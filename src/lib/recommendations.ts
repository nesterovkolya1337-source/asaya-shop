import type {Product} from './store-data';
// Shared selection boundary for PDP/cart. Replace the temporary manual input with
// merchandising settings when that feature lands; never merge competing lists.
export function selectRecommendations(products:Product[],excluded:string[],manual:string[]=[]){
 const candidates=products.filter(p=>p.active&&p.sku&&!excluded.includes(p.id));
 const ordered=[...candidates].sort((a,b)=>(a.placement?.catalogOrder??100000)-(b.placement?.catalogOrder??100000)||a.id.localeCompare(b.id));
 const chosen=manual.map(id=>candidates.find(p=>p.sku===id||p.id===id)).filter((p):p is Product=>!!p);
 return [...new Map([...chosen,...ordered].map(p=>[p.id,p])).values()].slice(0,4);
}
export function temporaryPdpRecommendationIds(product:Product){
 return product.pdp?.recommendations.length?product.pdp.recommendations:product.recommendations;
}
