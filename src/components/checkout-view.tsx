"use client";

import Image from "next/image";
import Link from "next/link";
import { type FormEvent, useMemo, useState } from "react";
import { useShop } from "@/components/shop-provider";
import { formatPrice } from "@/lib/store-data";
import styles from "./checkout-view.module.css";

export function CheckoutView() {
  const { cart, changeQuantity, clearCart, products, promoCode } = useShop();
  const [delivery, setDelivery] = useState<"pickup" | "courier">("pickup");
  const [placed, setPlaced] = useState(false);
  const cartProducts = products.filter((product) => cart[product.id]);
  const subtotal = useMemo(() => cartProducts.reduce((sum, product) => sum + product.price * cart[product.id], 0), [cart, cartProducts]);
  const deliveryPrice = delivery === "courier" && subtotal > 0 && subtotal < 1500 ? 300 : 0;
  const promoDiscount = promoCode === "ASAYA10" ? Math.round(subtotal * 0.1) : 0;
  const total = subtotal + deliveryPrice - promoDiscount;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cartProducts.length) return;
    setPlaced(true);
    clearCart();
  }

  if (placed) {
    return (
      <main className={styles.success}>
        <span>✓</span>
        <p>Демо-оформление завершено</p>
        <h1>Интерфейс работает, но заказ не отправлен без защищённого сервера.</h1>
        <Link href="/catalog">Вернуться в каталог</Link>
      </main>
    );
  }

  return (
    <main>
      <header className={styles.heading}>
        <p>ASAYA / Checkout</p>
        <h1>Оформление заказа</h1>
      </header>

      <form className={styles.checkoutGrid} onSubmit={submit}>
        <div className={styles.leftColumn}>
          <section className={styles.block} aria-labelledby="cart-heading">
            <div className={styles.blockHeading}>
              <h2 id="cart-heading">Ваш заказ</h2>
              <span>{cartProducts.length} поз.</span>
            </div>
            {cartProducts.length ? (
              <div className={styles.cartList}>
                {cartProducts.map((product) => (
                  <article className={styles.cartItem} key={product.id}>
                    <div className={styles.cartImage}><Image alt={product.name} fill sizes="96px" src={product.image} /></div>
                    <div className={styles.cartInfo}>
                      <h3>{product.name}</h3>
                      <span>{formatPrice(product.price)}</span>
                      <div className={styles.quantity}>
                        <button aria-label={"Уменьшить количество " + product.name} onClick={() => changeQuantity(product.id, cart[product.id] - 1)} type="button">−</button>
                        <strong>{cart[product.id]}</strong>
                        <button aria-label={"Увеличить количество " + product.name} onClick={() => changeQuantity(product.id, cart[product.id] + 1)} type="button">+</button>
                      </div>
                    </div>
                    <button className={styles.remove} onClick={() => changeQuantity(product.id, 0)} type="button">Удалить</button>
                  </article>
                ))}
              </div>
            ) : (
              <div className={styles.emptyCart}>
                <p>Корзина пока пуста.</p>
                <Link href="/catalog">Выбрать продукты</Link>
              </div>
            )}
          </section>

          <section className={styles.block} aria-labelledby="delivery-heading">
            <h2 id="delivery-heading">Доставка</h2>
            <div className={styles.choiceGrid}>
              <label className={delivery === "pickup" ? styles.selectedChoice : ""}>
                <input checked={delivery === "pickup"} name="delivery" onChange={() => setDelivery("pickup")} type="radio" />
                <strong>Пункт выдачи</strong>
                <span>Бесплатно от 1 500 ₽</span>
              </label>
              <label className={delivery === "courier" ? styles.selectedChoice : ""}>
                <input checked={delivery === "courier"} name="delivery" onChange={() => setDelivery("courier")} type="radio" />
                <strong>Курьер</strong>
                <span>300 ₽ · 1–3 дня</span>
              </label>
            </div>
            <label className={styles.address}>{delivery === "pickup" ? "Адрес или метро" : "Адрес доставки"}<input placeholder={delivery === "pickup" ? "Найти ближайший пункт" : "Город, улица, дом, квартира"} required={cartProducts.length > 0} /></label>
          </section>

          <section className={styles.block} aria-labelledby="customer-heading">
            <h2 id="customer-heading">Получатель</h2>
            <div className={styles.fieldGrid}>
              <label>Имя<input placeholder="Ваше имя" required={cartProducts.length > 0} /></label>
              <label>Телефон<input placeholder="+7 000 000-00-00" required={cartProducts.length > 0} type="tel" /></label>
              <label className={styles.fullWidth}>Почта<input placeholder="name@example.com" required={cartProducts.length > 0} type="email" /></label>
            </div>
          </section>

          <section className={styles.block} aria-labelledby="payment-heading">
            <h2 id="payment-heading">Оплата</h2>
            <label className={[styles.payment, styles.selectedChoice].join(" ")}><input defaultChecked name="payment" type="radio" /><span><strong>Банковской картой онлайн</strong><small>МИР · Visa · Mastercard</small></span></label>
          </section>
        </div>

        <aside className={styles.summary} aria-labelledby="summary-heading">
          <p>Итого</p>
          <h2 id="summary-heading">{formatPrice(total)}</h2>
          <div className={styles.summaryRows}>
            <div><span>Товары</span><strong>{formatPrice(subtotal)}</strong></div>
            {promoDiscount > 0 && <div><span>Промокод ASAYA10</span><strong>−{formatPrice(promoDiscount)}</strong></div>}
            <div><span>Доставка</span><strong>{deliveryPrice ? formatPrice(deliveryPrice) : "Бесплатно"}</strong></div>
          </div>
          <button disabled={!cartProducts.length} type="submit">Оформить заказ</button>
          <span className={styles.note}>Демо-режим: данные не отправляются и не сохраняются. Реальные заказы появятся только после подключения защищённого сервера.</span>
        </aside>
      </form>
    </main>
  );
}
