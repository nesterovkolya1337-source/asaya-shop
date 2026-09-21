import {assetPath} from './asset-path';
export type CartPricing={items:Array<{sku:string;quantity:number;unitMinor:number}>;eligibleUnits:number;percent:number;subtotalMinor:number;discountMinor:number;shippingRemainingMinor:number;settings:{twoPercent:number;threePercent:number;freeShippingMinor:number}};
export async function requestCartPricing(items:Array<{sku:string;quantity:number}>,signal?:AbortSignal):Promise<CartPricing>{
 const response=await fetch(assetPath('/api/store/v1/cart/pricing'),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({items}),cache:'no-store',signal});
 if(!response.ok)throw new Error('Не удалось рассчитать корзину. Обновите цены и наличие.');
 return response.json();
}
export function quantityProgress(q:CartPricing){
 if(q.eligibleUnits>=3)return `Скидка ${q.percent}% применена`;
 if(q.eligibleUnits===2)return `Добавьте ещё 1 товар — скидка ${q.settings.threePercent>q.percent?'увеличится до':'составит'} ${q.settings.threePercent}%`;
 if(q.eligibleUnits===1)return `Добавьте ещё 1 товар — получите скидку ${q.settings.twoPercent}%`;
 return '';
}
