import {selectRecommendations} from './recommendations.ts';
import type {Product} from './store-data';
import type {CartPricing} from './cart-pricing';

// The existing public catalog is the only source: never fetch Admin or drafts.
export function cartRecommendations(products:Product[],cart:Record<string,number>){
 return selectRecommendations(products,Object.keys(cart).filter(id=>cart[id]>0));
}
export function deliveryProgress(quote:Pick<CartPricing,'settings'|'shippingRemainingMinor'>){
 const threshold=quote.settings.freeShippingMinor;
 return threshold<=0?100:Math.max(0,Math.min(100,(threshold-quote.shippingRemainingMinor)/threshold*100));
}
