import {assetPath} from './asset-path';
export type CartPricing={promo?:{id:string;code:string;percent:number;beforeMinor:number;discountMinor:number;checkoutAvailable:false};loyalty?:{balance:number;maximum:number;redemptionAvailable:boolean}|null;items:Array<{sku:string;quantity:number;unitMinor:number}>;eligibleUnits:number;percent:number;subtotalMinor:number;discountMinor:number;shippingRemainingMinor:number;settings:{twoPercent:number;threePercent:number;freeShippingMinor:number}};
export async function requestCartPricing(items:Array<{sku:string;quantity:number}>,signal?:AbortSignal,promoCode?:string):Promise<CartPricing>{
 const response=await fetch(assetPath('/api/store/v1/cart/pricing'),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({items,...(promoCode?{promo_code:promoCode}:{})}),cache:'no-store',signal});
 if(!response.ok){const body=await response.json().catch(()=>({}));throw new Error(promoErrors[body.error]??'Не удалось рассчитать корзину. Попробуйте открыть её позже.');}
 return response.json();
}
export function quantityProgress(q:CartPricing){
 if(q.eligibleUnits>=3)return `Скидка ${q.percent}% применена`;
 if(q.eligibleUnits===2)return `Добавьте ещё 1 товар — скидка ${q.settings.threePercent>q.percent?'увеличится до':'составит'} ${q.settings.threePercent}%`;
 if(q.eligibleUnits===1)return `Добавьте ещё 1 товар — получите скидку ${q.settings.twoPercent}%`;
 return '';
}

const promoErrors:Record<string,string>={PROMO_NOT_FOUND:'Промокод не найден',PROMO_NOT_STARTED:'Промокод пока не действует',PROMO_EXPIRED:'Промокод больше не действует',PROMO_DISABLED:'Промокод отключён',PROMO_EXHAUSTED:'Лимит промокода исчерпан',PROMO_CUSTOMER_EXHAUSTED:'Вы уже использовали этот промокод',PROMO_LOGIN_REQUIRED:'Для этого промокода нужно войти в аккаунт'};
