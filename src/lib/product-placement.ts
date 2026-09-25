import type {Product} from './store-data';
export function placedProducts(products:Product[],section:'catalog'|'bestsellers'|'new',category=false):Product[]{
 const rank=(p:Product)=>section==='catalog'?(p.merchandising?(category&&p.merchandising.categoryOrder>=0?p.merchandising.categoryOrder:p.merchandising.catalogOrder>=0?p.merchandising.catalogOrder:100000):p.placement?.catalogOrder??0):section==='bestsellers'?p.merchandising?.bestsellerOrder??-1:p.merchandising?.newOrder??-1;
 return products.filter(p=>p.active&&(section==='catalog'||(rank(p)??-1)>=0)).sort((a,b)=>(rank(a)??0)-(rank(b)??0));
}
