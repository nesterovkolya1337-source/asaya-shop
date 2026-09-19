"use client";
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {useShop} from './shop-provider';
import {checkoutCart} from '@/lib/checkout-cart';
import {FREE_CDEK_PICKUP_FROM_RUB} from '@/lib/store-policy';
import styles from './server-checkout.module.css';
import {CartProductImage} from './cart-product-image';
import cartStyles from './server-cart-view.module.css';
import {YandexCheckoutButton} from './yandex-buy-button';
export const rubles=(minor:number)=>new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB'}).format(minor/100);
const purchaseSignature=(basket:ReturnType<typeof checkoutCart>)=>JSON.stringify([basket.items,basket.subtotalMinor]);
export function ServerCartView(){
 const {cart,products,changeQuantity,catalogStatus,refreshCatalog,yandexCheckoutEnabled}=useShop();
 const [notice,setNotice]=useState('');
 const basket=checkoutCart(cart,catalogStatus==='error'?products.map(p=>({...p,stockState:'unknown' as const})):products,true);
 const {rows,valid,subtotalMinor,items}=basket;
 const current=useRef(basket.signature);
 useEffect(()=>{current.current=basket.signature;},[basket.signature]);
 // Client-side cart navigation must refresh the same backend stock projection.
 useEffect(()=>{void refreshCatalog().catch(()=>{});},[refreshCatalog]);
 async function refresh(){
  setNotice('');
  try{await refreshCatalog();}catch{setNotice('Не удалось проверить наличие. Повторите обновление.');}
 }
 async function prepareItems(){
  const signature=basket.signature,previous=purchaseSignature(basket);
  const fresh=await refreshCatalog(),checked=checkoutCart(cart,fresh,true);
  if(current.current!==signature)return null;
  if(!checked.valid||purchaseSignature(checked)!==previous){
   setNotice('Наличие или цены изменились. Корзина обновлена — проверьте итог перед оформлением.');return null;
  }
  setNotice('');return checked.items;
 }
 async function conflict(){
  await refreshCatalog();setNotice('Наличие изменилось во время оформления. Проверьте обновлённую корзину.');
 }
 return <main className={styles.main}><p>ASAYA / Корзина</p><h1>Ваша корзина</h1>
 {catalogStatus==='loading'&&<p role="status">Проверяем актуальные цены и наличие…</p>}
 {catalogStatus==='error'&&<p role="alert">Каталог недоступен. Наличие не подтверждено, оформление временно отключено.</p>}
 {notice&&<p role="alert">{notice}</p>}
 {rows.length?rows.map(({id,quantity,product:p,purchasableQuantity,state})=><article className={styles.row+' '+cartStyles.row+' '+(purchasableQuantity===0?styles.unavailable:'')} key={id} data-cart-id={id}>
 <CartProductImage product={p} />
 <div className={cartStyles.details}><h2>{p?<Link href={`/product/${p.id}`}>{p.name}</Link>:'Товар временно недоступен'}</h2><p>{p?rubles(Math.round(p.price*100)*purchasableQuantity):'Цена недоступна'}</p>
 {state==='unavailable'&&<p role="status">Нет в наличии</p>}
 {state==='unknown'&&<p role="status">Наличие пока не подтверждено</p>}
 {state==='limited'&&<p role="status">Количество изменилось. Доступно к оформлению: {purchasableQuantity} из {quantity}.</p>}
 </div><div className={styles.actions+' '+cartStyles.quantity}>
 <button aria-label={'Уменьшить количество '+(p?.name??'товара')} onClick={()=>changeQuantity(id,quantity-1)}>−</button><span>{quantity}</span>
 <button aria-label={'Увеличить количество '+(p?.name??'товара')} disabled={catalogStatus!=='ready'||!purchasableQuantity||!p||quantity>=p.stock||quantity>=100} onClick={()=>changeQuantity(id,quantity+1)}>+</button>
 </div><button className={cartStyles.remove} onClick={()=>changeQuantity(id,0)}>Удалить</button></article>):<p>Корзина пока пуста.</p>}
 {rows.length>0&&<><p>Товары к оформлению: <strong>{rubles(subtotalMinor)}</strong></p>
 {valid&&<p>{subtotalMinor>=FREE_CDEK_PICKUP_FROM_RUB*100?'Достигнут порог бесплатной доставки в ПВЗ СДЭК.':'До бесплатной доставки в ПВЗ СДЭК — '+rubles(FREE_CDEK_PICKUP_FROM_RUB*100-subtotalMinor)+'.'} Итоговые условия доставки — при оформлении.</p>}
 {!valid&&catalogStatus==='ready'&&<p role="status">Сейчас в корзине нет товаров, доступных к оформлению.</p>}
 {yandexCheckoutEnabled&&<YandexCheckoutButton key={basket.signature} items={items} disabled={catalogStatus!=='ready'||!valid} prepareItems={prepareItems} onConflict={conflict} label="Оформить в Яндексе" />}
 <button onClick={()=>void refresh()} disabled={catalogStatus==='loading'}>Обновить цены и наличие</button>
 {!yandexCheckoutEnabled&&<p role="status">Оформление заказов пока недоступно. Корзина сохранена.</p>}
 </>}
 <p><Link href="/catalog">В каталог</Link></p></main>;
}
