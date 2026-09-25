"use client";
import {ProductRecommendations} from './product-recommendations';
import {pdpStockLabel} from '@/lib/pdp-presentation';
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {useShop} from './shop-provider';
import {checkoutCart} from '@/lib/checkout-cart';
import {requestCartPricing,type CartPricing} from '@/lib/cart-pricing';
import {assetPath} from '@/lib/asset-path';
import {cartRecommendations,deliveryProgress} from '@/lib/cart-presentation';
import {CarouselArrow} from './carousel-arrow';
import {CartProductImage} from './cart-product-image';
import cartStyles from './server-cart-view.module.css';
import {YandexCheckoutButton} from './yandex-buy-button';
import {formatMinorRubles as rubles} from '@/lib/money-format';
export {rubles};
const purchaseSignature=(basket:ReturnType<typeof checkoutCart>)=>JSON.stringify([basket.items,basket.subtotalMinor]);
export function ServerCartView(){
 const {cart,products,clearCart,changeQuantity,addToCart,favorites,toggleFavorite,checkoutEnabled,catalogStatus,refreshCatalog,yandexCheckoutEnabled}=useShop();
 const [notice,setNotice]=useState(''),[clearConfirm,setClearConfirm]=useState(false),[sticky,setSticky]=useState(false);

 const checkoutAnchor=useRef<HTMLDivElement>(null);
 useEffect(()=>{const node=checkoutAnchor.current;if(!node)return;const observer=new IntersectionObserver(([entry])=>setSticky(!entry.isIntersecting),{rootMargin:'-80px 0px 0px 0px'});observer.observe(node);return()=>observer.disconnect();},[Object.keys(cart).length>0]);
 const [promoCode,setPromoCode]=useState(''),[promoInput,setPromoInput]=useState(''),[promoOpen,setPromoOpen]=useState(false),[promoError,setPromoError]=useState(''),[promoBusy,setPromoBusy]=useState(false);
 const [priced,setPriced]=useState<{key:string;quote:CartPricing}|null>(null),[pricingError,setPricingError]=useState('');
 const basket=checkoutCart(cart,catalogStatus==='error'?products.map(p=>({...p,stockState:'unknown' as const})):products,true);
 const {rows,valid,items}=basket;
 const pricingKey=JSON.stringify([items,basket.subtotalMinor,promoCode]);
 const quote=priced?.key===pricingKey?priced.quote:null;
 useEffect(()=>{const controller=new AbortController();setPricingError('');void requestCartPricing(items,controller.signal,promoCode).then(quote=>{if(!controller.signal.aborted)setPriced({key:pricingKey,quote});}).catch(e=>{if(!controller.signal.aborted){if(promoCode){setPromoError(e.message);setPromoCode('');}else setPricingError(e.message);}});return()=>controller.abort();},[pricingKey]);
 const current=useRef(basket.signature);
 useEffect(()=>{current.current=basket.signature;},[basket.signature]);
 // Client-side cart navigation must refresh the same backend stock projection.
 useEffect(()=>{void refreshCatalog().catch(()=>{});},[refreshCatalog]);
 async function applyPromo(){if(promoBusy||!quote?.promoApplicationEnabled)return;setPromoBusy(true);setPromoError('');try{const result=await requestCartPricing(items,undefined,promoInput);setPromoCode(result.promo?.code??'');setPromoOpen(false);}catch(e){setPromoError(e instanceof Error?e.message:'Не удалось применить промокод.');}finally{setPromoBusy(false);}}
 async function prepareItems(){
  if(promoCode)return null;
  const signature=basket.signature,previous=purchaseSignature(basket);
  const fresh=await refreshCatalog(),checked=checkoutCart(cart,fresh,true);
  if(current.current!==signature)return null;
  if(!checked.valid||purchaseSignature(checked)!==previous){
   setNotice('Наличие или цены изменились. Корзина обновлена — проверьте итог перед оформлением.');return null;
  }
  const latest=await requestCartPricing(checked.items);
  if(current.current!==signature)return null;
  if(!quote||JSON.stringify(latest)!==JSON.stringify(quote)){setPriced({key:pricingKey,quote:latest});setNotice('Условия скидки изменились. Проверьте обновлённую сумму и нажмите оформление снова.');return null;}
  setNotice('');return checked.items;
 }
 async function conflict(){
  await refreshCatalog();setNotice('Наличие изменилось во время оформления. Проверьте обновлённую корзину.');
 }
 const recommendations=catalogStatus==='ready'?cartRecommendations(products,cart):[];
 const progress=quote?deliveryProgress(quote):0;
 return <main className={cartStyles.main} data-cart-sticky={sticky}>
 <p className={cartStyles.breadcrumb}><Link href="/">ASAYA</Link> / Корзина</p><h1>Товары в корзине</h1>
 {catalogStatus==='loading'&&<p role="status">Проверяем корзину…</p>}
 {catalogStatus==='error'&&<p className={cartStyles.notice} role="alert">Каталог недоступен. Оформление временно отключено.</p>}
 {notice&&<p className={cartStyles.notice} role="alert">{notice}</p>}
 {pricingError&&<p className={cartStyles.notice} role="alert">{pricingError}</p>}
 {rows.length?<div className={cartStyles.layout}>


 <section className={cartStyles.products} aria-label="Товары в заказе"><div className={cartStyles.listHeading}><h2>Товары в заказе ({rows.length})</h2></div>
 {rows.map(({id,quantity,product:p,purchasableQuantity,state})=>{
 const line=quote?.items.find(i=>i.sku===p?.sku);
 return <article className={cartStyles.row+' '+(purchasableQuantity===0?cartStyles.unavailable:'')} key={id} data-cart-id={id}>
 <CartProductImage product={p}/>
 <div className={cartStyles.details}><h3>{p?<Link href={`/product/${p.id}`}>{p.name}</Link>:'Товар временно недоступен'}</h3>
 {line&&p?<p className={cartStyles.prices}>{Math.round(p.oldPrice*100)>line.unitMinor&&<del>{rubles(Math.round(p.oldPrice*100))}</del>}<strong>{rubles(line.unitMinor)}</strong></p>:purchasableQuantity>0?<p>Рассчитываем цену…</p>:null}
 {state==='unavailable'&&<p role="status">{p?pdpStockLabel(p):"Нет в наличии"}</p>}
 {state==='unknown'&&<p role="status">Наличие пока не подтверждено</p>}
 {state==='limited'&&<p role="status">Доступно к оформлению: {purchasableQuantity} из {quantity}.</p>}
 <div className={cartStyles.quantity}>
 <button type="button" aria-label={'Уменьшить количество '+(p?.name??'товара')} onClick={()=>changeQuantity(id,quantity-1)}>−</button><span>{quantity}</span>
 <button type="button" aria-label={'Увеличить количество '+(p?.name??'товара')} disabled={catalogStatus!=='ready'||!purchasableQuantity||!p||quantity>=p.stock||quantity>=100} onClick={()=>changeQuantity(id,quantity+1)}>+</button>
 </div></div><button type="button" className={cartStyles.remove} aria-label={'Удалить '+(p?.name??'товар')} onClick={()=>changeQuantity(id,0)}><img src={assetPath('/images/figma/cart/remove.svg')} alt="" width={24} height={24}/></button>
 </article>;})}
 <div className={cartStyles.clearAction}><button type="button" onClick={()=>setClearConfirm(true)}>Очистить корзину</button>{clearConfirm&&<div role="alert"><p>Удалить все товары из корзины?</p><button type="button" onClick={()=>{clearCart();setClearConfirm(false);}}>Очистить</button><button type="button" onClick={()=>setClearConfirm(false)}>Отмена</button></div>}</div>
 </section>
 <div className={cartStyles.summaryCard}>
{quote&&valid&&<div className={cartStyles.delivery} aria-live="polite"><h2>{quote.shippingRemainingMinor===0?'Бесплатная доставка':'До бесплатной доставки осталось '+rubles(quote.shippingRemainingMinor)}</h2><progress aria-label="До бесплатной доставки" value={progress} max={100}/><div className={cartStyles.progressLabels}><span>{rubles(quote.subtotalMinor+quote.discountMinor+(quote.promo?.discountMinor??0))}</span><span>{rubles(quote.settings.freeShippingMinor)}</span></div></div>}
 <section className={cartStyles.summary} aria-label="Итоги заказа">
 {quote?.promoApplicationEnabled&&<section className={cartStyles.promo} aria-label="Промокод">
 {promoOpen?<form onSubmit={e=>{e.preventDefault();void applyPromo();}}><input autoFocus aria-label="Код промокода" placeholder="Введите промокод" value={promoInput} maxLength={100} onChange={e=>setPromoInput(e.target.value)}/><button disabled={promoBusy||!promoInput.trim()}>Применить</button></form>:quote.promo?<div className={cartStyles.promoApplied}><div><span>{quote.promo.code}</span><span>−{rubles(quote.promo.discountMinor)}</span></div><button type="button" onClick={()=>{setPromoInput(promoCode);setPromoOpen(true);}}>Изменить</button><button type="button" onClick={()=>{setPromoCode('');setPromoInput('');setPromoError('');}}>Удалить</button></div>:<button className={cartStyles.promoPrompt} type="button" onClick={()=>{setPromoInput('');setPromoOpen(true);}}><span>Введите промокод</span><span aria-hidden="true">→</span></button>}
 {promoError&&<p role="alert">{promoError}</p>}
 </section>}


 {quote&&(quote.loyalty?<div className={cartStyles.loyalty} aria-label="Бонусы в корзине"><span><span aria-hidden="true">✦ </span>Ваши баллы ASAYA<small>Начислим {quote.loyalty.cashbackPoints} бонусов за покупку</small></span><strong>{quote.loyalty.balance}</strong></div>:<div className={cartStyles.loyalty}><span>Войдите, чтобы использовать бонусы</span><Link className={cartStyles.guestLink} href="/account/">Войти</Link></div>)}
 <dl className={cartStyles.totals}><div><dt>Товары</dt><dd>{quote?rubles(quote.subtotalMinor+quote.discountMinor+(quote.promo?.discountMinor??0)):'Рассчитываем…'}</dd></div>
 {quote&&quote.discountMinor>0&&<div><dt>Скидка за количество ({quote.percent}%)</dt><dd>−{rubles(quote.discountMinor)}</dd></div>}
 {quote?.promo&&<div><dt>Промокод {quote.promo.code}</dt><dd>−{rubles(quote.promo.discountMinor)}</dd></div>}
 <div><dt>Доставка</dt><dd>{quote&&valid&&quote.shippingRemainingMinor===0?'Бесплатно':'Рассчитается при оформлении'}</dd></div>
 <div className={cartStyles.total}><dt>Итого за товары</dt><dd>{quote?rubles(quote.subtotalMinor):'Рассчитываем…'}</dd></div></dl>
 {!valid&&catalogStatus==='ready'&&<p role="status">Сейчас в корзине нет товаров, доступных к оформлению.</p>}
 <div ref={checkoutAnchor} className={cartStyles.checkoutAnchor}><div className={sticky?cartStyles.stickyCheckout:undefined}>{yandexCheckoutEnabled&&<YandexCheckoutButton key={basket.signature} items={items} disabled={!!promoCode||!checkoutEnabled||catalogStatus!=='ready'||!valid||rows.some(r=>r.purchasableQuantity!==r.quantity)||!quote||!!pricingError} prepareItems={prepareItems} onConflict={conflict} label={quote?'Оформить заказ · '+rubles(quote.subtotalMinor):'Оформить заказ'} showNote={false} />}</div></div>
 {(!yandexCheckoutEnabled||!checkoutEnabled)&&<p role="status">Оформление заказов пока недоступно. Корзина сохранена.</p>}
 </section></div></div>:<section className={cartStyles.empty}><h2>Корзина пока пуста</h2><Link href="/catalog/">Выбрать товары</Link></section>}
 <ProductRecommendations products={recommendations} interactionsDisabled={!!promoCode}/>
 </main>;
}
