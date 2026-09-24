import {selectRecommendations} from './recommendations.ts';
import type {Product} from './store-data';
import type {PdpContent,PdpSection} from '../../backend/src/pdp-content';
export function richSections(pdp?:PdpContent):PdpSection[]{
 if(!pdp?.enabled)return [];
 return pdp.sections.filter(s=>s.kind==='faq'?s.items.some(i=>i.title.trim()&&i.body.trim()):!!(s.body.trim()||s.additionalBody.trim()||s.media.length||s.items.some(i=>i.title.trim()||i.body.trim()||i.media)));
}
export function pdpRecommendations(products:Product[],product:Product,cartIds:string[]=[]){
 return selectRecommendations(products,[product.id],[],cartIds);
}
