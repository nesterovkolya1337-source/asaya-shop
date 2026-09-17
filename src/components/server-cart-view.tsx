"use client";
import Link from 'next/link';
import {useShop} from './shop-provider';
import {checkoutCart} from '@/lib/checkout-cart';
import styles from './server-checkout.module.css';
import {YandexCheckoutButton} from './yandex-buy-button';
export const rubles=(minor:number)=>new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB'}).format(minor/100);
export function ServerCartView(){
 const {cart,products,changeQuantity,catalogStatus,reloadCatalog,yandexCheckoutEnabled}=useShop();
 const {rows,valid,subtotalMinor,items}=checkoutCart(cart,products);
 return <main className={styles.main}><p>ASAYA / Корзина</p><h1>Ваша корзина</h1>
 {catalogStatus==='loading'?<p>Загружаем актуальные товары…</p>:catalogStatus==='error'?<><p role="alert">Каталог недоступен.</p><button onClick={reloadCatalog}>Повторить загрузку</button></>:<>
 {rows.length?rows.map(({id,quantity,product:p})=><article className={styles.row} key={id}><div><h2>{p?.name??'Товар временно недоступен'}</h2><p>{p?rubles(Math.round(p.price*100)*quantity):'Цена недоступна'}</p>
 {p&&quantity>p.stock&&<p role="alert">Недостаточно товара. Доступно: {p.stock}.</p>}</div><div className={styles.actions}>
 <button aria-label={'Уменьшить количество '+(p?.name??'товара')} onClick={()=>changeQuantity(id,quantity-1)}>−</button><span>{quantity}</span>
 <button aria-label={'Увеличить количество '+(p?.name??'товара')} disabled={!p||quantity>=p.stock||quantity>=100} onClick={()=>changeQuantity(id,quantity+1)}>+</button>
 <button onClick={()=>changeQuantity(id,0)}>Удалить</button></div></article>):<p>Корзина пока пуста.</p>}
 {rows.length>0&&<><p>Товары: <strong>{rubles(subtotalMinor)}</strong></p><p>Доставка рассчитывается при оформлении.</p></>}
 {rows.length>0&&yandexCheckoutEnabled&&<>
 {!valid&&<p role="alert">Проверьте количество и удалите недоступные товары перед оформлением.</p>}
 <YandexCheckoutButton key={JSON.stringify([items,valid,subtotalMinor])} items={items} disabled={!valid} label="Оформить в Яндексе" />
 <button onClick={reloadCatalog}>Обновить цены и наличие</button>
 </>}
 {rows.length>0&&!yandexCheckoutEnabled&&<p role="status">Оформление заказов пока недоступно. Корзина сохранена.</p>}
 </>}<p><Link href="/catalog">В каталог</Link></p></main>;
}
