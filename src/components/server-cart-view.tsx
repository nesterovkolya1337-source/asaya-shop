"use client";
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {useShop} from './shop-provider';
import {checkoutCart} from '@/lib/checkout-cart';
import {requestCartPricing,quantityProgress,type CartPricing} from '@/lib/cart-pricing';
import styles from './server-checkout.module.css';
import {CartProductImage} from './cart-product-image';
import cartStyles from './server-cart-view.module.css';
import {YandexCheckoutButton} from './yandex-buy-button';
export const rubles=(minor:number)=>new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB'}).format(minor/100);
const purchaseSignature=(basket:ReturnType<typeof checkoutCart>)=>JSON.stringify([basket.items,basket.subtotalMinor]);
export function ServerCartView(){
 const {cart,products,changeQuantity,catalogStatus,refreshCatalog,yandexCheckoutEnabled}=useShop();
 const [notice,setNotice]=useState('');
 const [priced,setPriced]=useState<{key:string;quote:CartPricing}|null>(null),[pricingError,setPricingError]=useState(''),[refreshKey,setRefreshKey]=useState(0);
 const basket=checkoutCart(cart,catalogStatus==='error'?products.map(p=>({...p,stockState:'unknown' as const})):products,true);
 const {rows,valid,items}=basket;
 const pricingKey=JSON.stringify([items,basket.subtotalMinor,refreshKey]);
 const quote=priced?.key===pricingKey?priced.quote:null;
 useEffect(()=>{const controller=new AbortController();setPricingError('');void requestCartPricing(items,controller.signal).then(quote=>{if(!controller.signal.aborted)setPriced({key:pricingKey,quote});}).catch(e=>{if(!controller.signal.aborted)setPricingError(e.message);});return()=>controller.abort();},[pricingKey]);
 const current=useRef(basket.signature);
 useEffect(()=>{current.current=basket.signature;},[basket.signature]);
 // Client-side cart navigation must refresh the same backend stock projection.
 useEffect(()=>{void refreshCatalog().catch(()=>{});},[refreshCatalog]);
 async function refresh(){
  setNotice('');setRefreshKey(k=>k+1);
  try{await refreshCatalog();}catch{setNotice('Не удалось проверить наличие. Повторите обновление.');}
 }
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
 return <main className={styles.main}><p>ASAYA / Корзина</p><h1>Ваша корзина</h1>
 {catalogStatus==='loading'&&<p role="status">Проверяем актуальные цены и наличие…</p>}
 {catalogStatus==='error'&&<p role="alert">Каталог недоступен. Наличие не подтверждено, оформление временно отключено.</p>}
 {notice&&<p role="alert">{notice}</p>}
 {pricingError&&<p role="alert">{pricingError}</p>}
 {rows.length?rows.map(({id,quantity,product:p,purchasableQuantity,state})=><article className={styles.row+' '+cartStyles.row+' '+(purchasableQuantity===0?styles.unavailable:'')} key={id} data-cart-id={id}>
 <CartProductImage product={p} />
 <div className={cartStyles.details}><h2>{p?<Link href={`/product/${p.id}`}>{p.name}</Link>:'Товар временно недоступен'}</h2><p>{p&&quote?rubles((quote.items.find(i=>i.sku===p.sku)?.unitMinor??0)*purchasableQuantity):'Рассчитываем цену…'}</p>
 {state==='unavailable'&&<p role="status">Нет в наличии</p>}
 {state==='unknown'&&<p role="status">Наличие пока не подтверждено</p>}
 {state==='limited'&&<p role="status">Количество изменилось. Доступно к оформлению: {purchasableQuantity} из {quantity}.</p>}
 </div><div className={styles.actions+' '+cartStyles.quantity}>
 <button aria-label={'Уменьшить количество '+(p?.name??'товара')} onClick={()=>changeQuantity(id,quantity-1)}>−</button><span>{quantity}</span>
 <button aria-label={'Увеличить количество '+(p?.name??'товара')} disabled={catalogStatus!=='ready'||!purchasableQuantity||!p||quantity>=p.stock||quantity>=100} onClick={()=>changeQuantity(id,quantity+1)}>+</button>
 </div><button className={cartStyles.remove} onClick={()=>changeQuantity(id,0)}>Удалить</button></article>):<p>Корзина пока пуста.</p>}
 {rows.length>0&&<><p>Товары к оформлению: <strong>{quote?rubles(quote.subtotalMinor):'Рассчитываем…'}</strong></p>
 {quote&&<>{quote.discountMinor>0&&<p>Скидка за количество: {rubles(quote.discountMinor)}</p>}{quantityProgress(quote)&&<p role="status">{quantityProgress(quote)}</p>}{valid&&<p>{quote.shippingRemainingMinor===0?'Бесплатная доставка доступна':'До бесплатной доставки осталось '+rubles(quote.shippingRemainingMinor)}. Стандартная доставка в ПВЗ СДЭК. Итоговые условия — при оформлении.</p>}</>}
 {!valid&&catalogStatus==='ready'&&<p role="status">Сейчас в корзине нет товаров, доступных к оформлению.</p>}
 {yandexCheckoutEnabled&&<YandexCheckoutButton key={basket.signature} items={items} disabled={catalogStatus!=='ready'||!valid||!quote||!!pricingError} prepareItems={prepareItems} onConflict={conflict} label="Оформить в Яндексе" />}
 <button onClick={()=>void refresh()} disabled={catalogStatus==='loading'}>Обновить цены и наличие</button>
 {!yandexCheckoutEnabled&&<p role="status">Оформление заказов пока недоступно. Корзина сохранена.</p>}
 </>}
 <p><Link href="/catalog">В каталог</Link></p></main>;
}
