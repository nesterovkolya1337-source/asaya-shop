type CurrentProduct={id:string;sku?:string;name:string;stock:number;active:boolean};
type OldLine={sku:string;name_snapshot:string;quantity:number};
export function repeatOrderPlan(lines:OldLine[],products:CurrentProduct[],cart:Record<string,number>){
 const next={...cart},skipped:string[]=[];let added=0;
 for(const line of lines){const product=products.find(p=>p.sku===line.sku),quantity=product?.active?Math.min(line.quantity,Math.max(0,Math.min(product.stock,100)-(next[product.id]??0))):0;
  if(product&&quantity>0){next[product.id]=(next[product.id]??0)+quantity;added+=quantity;}
  if(quantity<line.quantity)skipped.push(line.name_snapshot);
 }
 return {cart:next,added,skipped};
}
