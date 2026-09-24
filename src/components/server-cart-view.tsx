"use client";
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {useShop} from './shop-provider';
import {checkoutCart} from '@/lib/checkout-cart';
import {requestCartPricing,quantityProgress,type CartPricing} from '@/lib/cart-pricing';
import {assetPath} from '@/lib/asset-path';
import {cartRecommendations,deliveryProgress} from '@/lib/cart-presentation';
import {CartProductImage} from './cart-product-image';
import cartStyles from './server-cart-view.module.css';
import {YandexCheckoutButton} from './yandex-buy-button';
export const rubles=(minor:number)=>new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB'}).format(minor/100);
const purchaseSignature=(basket:ReturnType<typeof checkoutCart>)=>JSON.stringify([basket.items,basket.subtotalMinor]);
export function ServerCartView(){
 const {cart,products,changeQuantity,addToCart,checkoutEnabled,catalogStatus,refreshCatalog,yandexCheckoutEnabled}=useShop();
 const [notice,setNotice]=useState('');
 const [priced,setPriced]=useState<{key:string;quote:CartPricing}|null>(null),[pricingError,setPricingError]=useState('');
 const basket=checkoutCart(cart,catalogStatus==='error'?products.map(p=>({...p,stockState:'unknown' as const})):products,true);
 const {rows,valid,items}=basket;
 const pricingKey=JSON.stringify([items,basket.subtotalMinor]);
 const quote=priced?.key===pricingKey?priced.quote:null;
 useEffect(()=>{const controller=new AbortController();setPricingError('');void requestCartPricing(items,controller.signal).then(quote=>{if(!controller.signal.aborted)setPriced({key:pricingKey,quote});}).catch(e=>{if(!controller.signal.aborted)setPricingError(e.message);});return()=>controller.abort();},[pricingKey]);
 const current=useRef(basket.signature);
 useEffect(()=>{current.current=basket.signature;},[basket.signature]);
 // Client-side cart navigation must refresh the same backend stock projection.
 useEffect(()=>{void refreshCatalog().catch(()=>{});},[refreshCatalog]);
 async function prepareItems(){
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
 return <main className={cartStyles.main}>
 <p className={cartStyles.breadcrumb}><Link href="/">ASAYA</Link> / Корзина</p><h1>Товары в корзине</h1>
 {catalogStatus==='loading'&&<p role="status">Проверяем корзину…</p>}
 {catalogStatus==='error'&&<p className={cartStyles.notice} role="alert">Каталог недоступен. Оформление временно отключено.</p>}
 {notice&&<p className={cartStyles.notice} role="alert">{notice}</p>}
 {pricingError&&<p className={cartStyles.notice} role="alert">{pricingError}</p>}
 {rows.length?<div className={cartStyles.layout}>
 <section className={cartStyles.products} aria-label="Товары в заказе"><h2>Товары в заказе</h2>
 {rows.map(({id,quantity,product:p,purchasableQuantity,state})=>{
 const line=quote?.items.find(i=>i.sku===p?.sku);
 return <article className={cartStyles.row+' '+(purchasableQuantity===0?cartStyles.unavailable:'')} key={id} data-cart-id={id}>
 <CartProductImage product={p}/>
 <div className={cartStyles.details}><h3>{p?<Link href={`/product/${p.id}`}>{p.name}</Link>:'Товар временно недоступен'}</h3>
 {line&&p?<p className={cartStyles.prices}>{Math.round(p.oldPrice*100)>line.unitMinor&&<del>{rubles(Math.round(p.oldPrice*100))}</del>}<strong>{rubles(line.unitMinor)}</strong></p>:purchasableQuantity>0?<p>Рассчитываем цену…</p>:null}
 {state==='unavailable'&&<p role="status">Нет в наличии</p>}
 {state==='unknown'&&<p role="status">Наличие пока не подтверждено</p>}
 {state==='limited'&&<p role="status">Доступно к оформлению: {purchasableQuantity} из {quantity}.</p>}
 <div className={cartStyles.quantity}>
 <button type="button" aria-label={'Уменьшить количество '+(p?.name??'товара')} onClick={()=>changeQuantity(id,quantity-1)}>−</button><span>{quantity}</span>
 <button type="button" aria-label={'Увеличить количество '+(p?.name??'товара')} disabled={catalogStatus!=='ready'||!purchasableQuantity||!p||quantity>=p.stock||quantity>=100} onClick={()=>changeQuantity(id,quantity+1)}>+</button>
 </div></div><button type="button" className={cartStyles.remove} aria-label={'Удалить '+(p?.name??'товар')} onClick={()=>changeQuantity(id,0)}><img src={assetPath('/images/figma/cart/remove.svg')} alt="" width={24} height={24}/></button>
 </article>;})}
 </section>
 <section className={cartStyles.summary} aria-label="Итоги заказа">
 {quote&&valid&&<div className={cartStyles.delivery} aria-live="polite"><progress aria-label="До бесплатной доставки" value={progress} max={100}/><div className={cartStyles.progressLabels}><span>{rubles(quote.subtotalMinor)}</span><span>{rubles(quote.settings.freeShippingMinor)}</span></div><p>{quote.shippingRemainingMinor===0?'Бесплатная доставка':'До бесплатной доставки осталось '+rubles(quote.shippingRemainingMinor)}</p></div>}
 {quote&&quantityProgress(quote)&&<p className={cartStyles.discountBadge} role="status">{quantityProgress(quote)}</p>}
 {quote&&(quote.loyalty?<div className={cartStyles.loyalty} aria-label="Бонусы в корзине"><span>Ваши баллы ASAYA<small>1 балл = 1 ₽</small></span><strong>{quote.loyalty.balance}</strong></div>:<Link className={cartStyles.guestLink} href="/account/">Войти, чтобы увидеть баллы</Link>)}
 <dl className={cartStyles.totals}><div><dt>Товары</dt><dd>{quote?rubles(quote.subtotalMinor+quote.discountMinor):'Рассчитываем…'}</dd></div>
 {quote&&quote.discountMinor>0&&<div><dt>Скидка за количество</dt><dd>−{rubles(quote.discountMinor)}</dd></div>}
 <div><dt>Доставка</dt><dd>{quote&&valid&&quote.shippingRemainingMinor===0?'Бесплатно':'При оформлении'}</dd></div>
 <div className={cartStyles.total}><dt>Итого за товары</dt><dd>{quote?rubles(quote.subtotalMinor):'Рассчитываем…'}</dd></div></dl>
 {!valid&&catalogStatus==='ready'&&<p role="status">Сейчас в корзине нет товаров, доступных к оформлению.</p>}
 {yandexCheckoutEnabled&&<YandexCheckoutButton key={basket.signature} items={items} disabled={catalogStatus!=='ready'||!valid||!quote||!!pricingError} prepareItems={prepareItems} onConflict={conflict} label="Оформить заказ" showNote={false} />}
 {!yandexCheckoutEnabled&&<p role="status">Оформление заказов пока недоступно. Корзина сохранена.</p>}
 </section></div>:<section className={cartStyles.empty}><h2>Корзина пока пуста</h2><Link href="/catalog/">Выбрать товары</Link></section>}
 {recommendations.length>0&&<section className={cartStyles.recommendations} aria-label="Рекомендуем добавить"><h2>Рекомендуем добавить</h2><div className={cartStyles.recommendationGrid}>
 {recommendations.map(p=><article key={p.id} className={cartStyles.recommendation} data-recommendation-id={p.id}><CartProductImage product={p} sizes="(max-width: 760px) 42vw, (max-width: 1000px) 45vw, 22vw"/><h3><Link href={'/product/'+p.id+'/'}>{p.name}</Link></h3><div className={cartStyles.prices}><strong>{rubles(Math.round(p.price*100))}</strong>{p.oldPrice>p.price&&<del>{rubles(Math.round(p.oldPrice*100))}</del>}</div><button type="button" disabled={!checkoutEnabled||p.stockState==='unknown'||p.stock<1} onClick={()=>addToCart(p.id)} aria-label={'Добавить в корзину '+p.name}>{p.stockState==='unknown'?'Наличие уточняется':p.stock<1?'Нет в наличии':'В корзину'}</button></article>)}
 </div></section>}
 </main>;
}
