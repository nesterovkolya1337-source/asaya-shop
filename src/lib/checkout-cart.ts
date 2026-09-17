import type {Product} from './store-data';
export function checkoutCart(cart:Record<string,number>,products:Product[],partial=false) {
 const rows=Object.entries(cart).filter(([,quantity])=>quantity>0).map(([id,quantity])=>{
  const product=products.find(p=>p.id===id),known=!!product?.active&&!!product.sku&&product.stockState!=='unknown'&&Number.isSafeInteger(product.stock)&&product.stock>=0;
  const purchasableQuantity=known&&Number.isInteger(quantity)&&quantity<=100?Math.min(quantity,product!.stock):0;
  return {id,quantity,product,purchasableQuantity,state:!known?'unknown':product!.stock===0?'unavailable':purchasableQuantity<quantity?'limited':'available'};
 });
 const purchasable=rows.filter(r=>r.purchasableQuantity>0);
 const valid=rows.length>0&&rows.length<=50&&(partial?purchasable.length>0:rows.every(r=>r.purchasableQuantity===r.quantity));
 return {rows,valid,items:valid?purchasable.map(({product:p,purchasableQuantity})=>({sku:p!.sku!,quantity:purchasableQuantity})):[],
 subtotalMinor:rows.reduce((s,{product:p,quantity,purchasableQuantity})=>s+(p?Math.round(p.price*100)*(partial?purchasableQuantity:quantity):0),0),
 signature:JSON.stringify(Object.entries(cart).filter(([,q])=>q>0).sort(([a],[b])=>a.localeCompare(b)))};
}
