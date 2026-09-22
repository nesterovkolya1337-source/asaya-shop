import type {Product} from './store-data';
import type {PdpContent,PdpSection} from '../../backend/src/pdp-content';
export function richSections(pdp?:PdpContent):PdpSection[]{
 if(!pdp?.enabled)return [];
 return pdp.sections.filter(s=>s.kind==='faq'?s.items.some(i=>i.title.trim()&&i.body.trim()):!!(s.body.trim()||s.additionalBody.trim()||s.media.length||s.items.some(i=>i.title.trim()||i.body.trim()||i.media)));
}
export function pdpRecommendations(products:Product[],product:Product){
 const eligible=products.filter(p=>p.active&&p.sku&&p.id!==product.id);
 const manual=product.pdp?.recommendations.length?product.pdp.recommendations:product.recommendations;
 const chosen=manual.map(id=>eligible.find(p=>p.sku===id||p.id===id)).filter((p):p is Product=>!!p);
 const fallback=[...eligible].sort((a,b)=>(a.placement?.catalogOrder??100000)-(b.placement?.catalogOrder??100000)||a.id.localeCompare(b.id));
 return [...new Map([...chosen,...fallback].map(p=>[p.id,p])).values()].slice(0,4);
}
