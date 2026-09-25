'use client';
import {useShop} from './shop-provider';
import {YandexCheckoutButton} from './yandex-buy-button';
import {pdpStockLabel} from '@/lib/pdp-presentation';
import type {Product} from '@/lib/store-data';
import styles from './product-purchase-actions.module.css';

/** Inline, card and floating controls share the existing ShopProvider cart. */
export function ProductPurchaseActions({product,quickBuy=true,compact=false,addLabel='В корзину',interactionsDisabled=false}:{product:Product;quickBuy?:boolean;compact?:boolean;addLabel?:string;interactionsDisabled?:boolean}){
 const {cart,addToCart,changeQuantity,catalogOnly,checkoutEnabled}=useShop();
 const quantity=cart[product.id]??0,closed=catalogOnly&&!checkoutEnabled;
 const disabled=interactionsDisabled||closed||product.stock<=0;
 return <div className={`${styles.actions} ${compact?styles.compact:''}`} data-purchase-actions>
  {quickBuy&&product.sku&&<div className={styles.quick}><YandexCheckoutButton compact showNote={false} items={[{sku:product.sku,quantity:quantity||1}]} disabled={disabled||product.stock<(quantity||1)} label="Купить в 1 клик"/></div>}
  {quantity>0&&product.stock>0?<div className={styles.stepper} role="group" aria-label={`Количество ${product.name} в корзине`}>
   <button type="button" aria-label={`Уменьшить количество ${product.name}`} disabled={interactionsDisabled} onClick={()=>changeQuantity(product.id,quantity-1)}>−</button>
   <output aria-live="polite">{quantity}</output>
   <button type="button" aria-label={`Увеличить количество ${product.name}`} disabled={interactionsDisabled||closed||quantity>=product.stock} onClick={()=>changeQuantity(product.id,quantity+1)}>+</button>
  </div>:<button className={styles.add} type="button" disabled={disabled} onClick={()=>addToCart(product.id)}>{product.stock<=0?pdpStockLabel(product):closed?'Продажи пока закрыты':addLabel}</button>}
 </div>;
}
