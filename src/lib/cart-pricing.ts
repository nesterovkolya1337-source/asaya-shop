import {assetPath} from './asset-path';
export type CartPricing={promoApplicationEnabled?:boolean;promo?:{code:string;discountMinor:number;subtotalMinor:number;checkoutAvailable:false}|null;loyalty?:{cashbackPoints:number;balance:number;maximum:number;redemptionAvailable:boolean}|null;items:Array<{sku:string;quantity:number;unitMinor:number}>;eligibleUnits:number;percent:number;subtotalMinor:number;discountMinor:number;shippingRemainingMinor:number;settings:{twoPercent:number;threePercent:number;freeShippingMinor:number}};
export async function requestCartPricing(items:Array<{sku:string;quantity:number}>,signal?:AbortSignal,promoCode?:string):Promise<CartPricing>{
 const response=await fetch(assetPath('/api/store/v1/cart/pricing'),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({items,...(promoCode?{promoCode}:{})}),cache:'no-store',signal});
 if(!response.ok){const data=await response.json().catch(()=>({}));const messages:Record<string,string>={PROMO_APPLICATION_DISABLED:'Применение промокодов пока недоступно.',PROMO_NOT_FOUND:'Промокод не найден.',PROMO_INACTIVE:'Промокод отключён.',PROMO_EXPIRED:'Срок действия промокода истёк.',PROMO_NOT_STARTED:'Промокод ещё не действует.',PROMO_MINIMUM:'Сумма товаров меньше минимальной для промокода.',PROMO_LIMIT:'Лимит использований промокода исчерпан.'};throw new Error(messages[data.error]??'Не удалось рассчитать корзину. Попробуйте позже.');}
 return response.json();
}
export function quantityProgress(q:CartPricing){
 if(q.eligibleUnits>=3)return `Скидка ${q.percent}% применена`;
 if(q.eligibleUnits===2)return `Добавьте ещё 1 товар — скидка ${q.settings.threePercent>q.percent?'увеличится до':'составит'} ${q.settings.threePercent}%`;
 if(q.eligibleUnits===1)return `Добавьте ещё 1 товар — получите скидку ${q.settings.twoPercent}%`;
 return '';
}
