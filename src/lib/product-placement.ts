import type {Product} from './store-data';
export function placedProducts(products:Product[],section:'catalog'|'bestsellers'|'new'):Product[]{
 const rank=(p:Product)=>section==='catalog'?p.placement?.catalogOrder??0:section==='bestsellers'?p.placement?.bestsellerOrder:p.placement?.newOrder;
 return products.filter(p=>p.active&&(section==='catalog'||(p.placement?rank(p)!==null:p.badge===(section==='bestsellers'?'Бестселлер':'Новинка')))).sort((a,b)=>(rank(a)??0)-(rank(b)??0));
}
