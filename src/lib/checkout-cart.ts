import type {Product} from './store-data';
export function checkoutCart(cart:Record<string,number>,products:Product[]) {
 const rows=Object.entries(cart).filter(([,quantity])=>quantity>0).map(([id,quantity])=>({id,quantity,product:products.find(p=>p.id===id)}));
 const valid=rows.length>0&&rows.length<=50&&rows.every(({product:p,quantity:q})=>p?.active&&p.sku&&Number.isInteger(q)&&q<=100&&q<=p.stock);
 return {rows,valid,items:valid?rows.map(({product:p,quantity})=>({sku:p!.sku!,quantity})):[],
 subtotalMinor:rows.reduce((s,{product:p,quantity})=>s+(p?Math.round(p.price*100)*quantity:0),0),
 signature:JSON.stringify(Object.entries(cart).filter(([,q])=>q>0).sort(([a],[b])=>a.localeCompare(b)))};
}

