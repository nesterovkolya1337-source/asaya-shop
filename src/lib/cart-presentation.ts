import type {Product} from './store-data';
import type {CartPricing} from './cart-pricing';

// The existing public catalog is the only source: never fetch Admin or drafts.
export function cartRecommendations(products:Product[],cart:Record<string,number>){
 return products.filter(p=>p.active&&p.sku&&!(cart[p.id]>0))
  .sort((a,b)=>(a.placement?.catalogOrder??100000)-(b.placement?.catalogOrder??100000)||a.id.localeCompare(b.id)).slice(0,4);
}
export function deliveryProgress(quote:Pick<CartPricing,'settings'|'shippingRemainingMinor'>){
 const threshold=quote.settings.freeShippingMinor;
 return threshold<=0?100:Math.max(0,Math.min(100,(threshold-quote.shippingRemainingMinor)/threshold*100));
}
