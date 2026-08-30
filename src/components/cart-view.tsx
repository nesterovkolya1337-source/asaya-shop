"use client";

import Image from "next/image";
import Link from "next/link";
import { type FormEvent, useMemo, useState } from "react";
import { useShop } from "@/components/shop-provider";
import { formatPrice } from "@/lib/store-data";
import styles from "./cart-view.module.css";

const FREE_DELIVERY = 1500;

export function CartView() {
  const { addToCart, cart, changeQuantity, clearCart, products, promoCode, setPromoCode } = useShop();
  const [promo, setPromo] = useState("");
  const promoApplied = promoCode === "ASAYA10";
  const cartProducts = products.filter((product) => cart[product.id] && product.active);
  const recommendations = products.filter((product) => product.active && !cart[product.id]).slice(0, 2);
  const subtotal = useMemo(
    () => cartProducts.reduce((sum, product) => sum + product.oldPrice * cart[product.id], 0),
    [cart, cartProducts],
  );
  const currentTotal = useMemo(
    () => cartProducts.reduce((sum, product) => sum + product.price * cart[product.id], 0),
    [cart, cartProducts],
  );
  const productDiscount = subtotal - currentTotal;
  const promoDiscount = promoApplied ? Math.round(currentTotal * 0.1) : 0;
  const total = Math.max(0, currentTotal - promoDiscount);
  const remaining = Math.max(0, FREE_DELIVERY - total);
  const progress = Math.min(100, (total / FREE_DELIVERY) * 100);

  function applyPromo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPromoCode(promo.trim().toUpperCase() === "ASAYA10" ? "ASAYA10" : "");
  }

  if (!cartProducts.length) {
    return (
      <main className={styles.main}>
        <section className={styles.empty}>
          <span aria-hidden="true">♡</span>
          <h1>Корзина пока пуста</h1>
          <p>Добавьте продукты из каталога — они сразу появятся здесь.</p>
          <Link href="/catalog">Добавить товары</Link>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.main}>
      <section className={styles.cartPanel} aria-labelledby="cart-heading">
        <header className={styles.heading}>
          <h1 id="cart-heading">Товары в корзине</h1>
          <Link aria-label="Закрыть корзину" href="/catalog">×</Link>
        </header>

        <div className={styles.deliveryProgress}>
          <div className={styles.progressTrack}><span style={{ width: `${progress}%` }} /></div>
          <div className={styles.progressLabels}><span>{formatPrice(total)}</span><span>{formatPrice(FREE_DELIVERY)}</span></div>
          <p>{remaining ? `Закажите ещё на ${formatPrice(remaining)} для бесплатной доставки` : "Бесплатная доставка доступна"}</p>
        </div>

        <div className={styles.cartList}>
          {cartProducts.map((product) => {
            const quantity = cart[product.id];
            return (
              <article className={styles.cartItem} key={product.id}>
                <Link className={styles.itemImage} href={`/product/${product.id}`}>
                  <Image alt={product.name} fill sizes="120px" src={product.image} />
                </Link>
                <div className={styles.itemDetails}>
                  <Link href={`/product/${product.id}`}><h2>{product.name}</h2></Link>
                  <div className={styles.itemPrices}>
                    {product.oldPrice > product.price && <span>{formatPrice(product.oldPrice)}</span>}
                    <strong>{formatPrice(product.price)}</strong>
                  </div>
                  <div className={styles.quantity} aria-label={`Количество ${product.name}`}>
                    <button aria-label={`Уменьшить количество ${product.name}`} onClick={() => changeQuantity(product.id, quantity - 1)} type="button">−</button>
                    <strong>{quantity}</strong>
                    <button aria-label={`Увеличить количество ${product.name}`} disabled={quantity >= product.stock} onClick={() => changeQuantity(product.id, quantity + 1)} type="button">+</button>
                  </div>
                </div>
                <button className={styles.removeItem} onClick={() => changeQuantity(product.id, 0)} type="button" aria-label={`Удалить ${product.name}`}>×</button>
              </article>
            );
          })}
        </div>

        <button className={styles.clear} onClick={clearCart} type="button">Очистить корзину</button>

        <form className={styles.promo} onSubmit={applyPromo}>
          <label htmlFor="promo">Промокод</label>
          <div>
            <input id="promo" onChange={(event) => { setPromo(event.target.value); setPromoCode(""); }} placeholder="ASAYA10" value={promo || promoCode} />
            <button aria-label="Применить промокод" type="submit">→</button>
          </div>
          {(promo || promoCode) && <small>{promoApplied ? "Промокод применён: скидка 10%" : "Введите ASAYA10 для демо-скидки"}</small>}
        </form>

        {recommendations.length > 0 && (
          <section className={styles.recommendations} aria-labelledby="recommendations-heading">
            <h2 id="recommendations-heading">Рекомендуем добавить</h2>
            <div>
              {recommendations.map((product) => (
                <article key={product.id}>
                  <Link className={styles.recommendationImage} href={`/product/${product.id}`}>
                    <Image alt={product.name} fill sizes="70px" src={product.image} />
                  </Link>
                  <div><Link href={`/product/${product.id}`}>{product.name}</Link><strong>{formatPrice(product.price)}</strong></div>
                  <button aria-label={`Добавить ${product.name} в корзину`} onClick={() => addToCart(product.id)} type="button">+</button>
                </article>
              ))}
            </div>
          </section>
        )}

        <div className={styles.totals}>
          <div><span>{cartProducts.reduce((sum, product) => sum + cart[product.id], 0)} товар(а)</span><strong>{formatPrice(subtotal)}</strong></div>
          {productDiscount > 0 && <div><span>Скидка</span><strong>−{formatPrice(productDiscount)}</strong></div>}
          {promoDiscount > 0 && <div><span>Промокод</span><strong>−{formatPrice(promoDiscount)}</strong></div>}
          <div className={styles.total}><span>Итого</span><strong>{formatPrice(total)}</strong></div>
        </div>

        <Link className={styles.checkoutButton} href="/checkout"><span>Оформить заказ</span><strong>{formatPrice(total)}</strong></Link>
      </section>
    </main>
  );
}
