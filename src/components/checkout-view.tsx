"use client";

import Image from "next/image";
import Link from "next/link";
import { type FormEvent, useMemo, useState } from "react";
import { useShop } from "@/components/shop-provider";
import { formatPrice } from "@/lib/store-data";
import styles from "./checkout-view.module.css";

export function CheckoutView() {
  const { cart, clearCart, products, promoCode } = useShop();
  const [placed, setPlaced] = useState(false);
  const cartProducts = products.filter((product) => cart[product.id]);
  const itemCount = cartProducts.reduce((sum, product) => sum + cart[product.id], 0);
  const oldSubtotal = useMemo(() => cartProducts.reduce((sum, product) => sum + product.oldPrice * cart[product.id], 0), [cart, cartProducts]);
  const subtotal = useMemo(() => cartProducts.reduce((sum, product) => sum + product.price * cart[product.id], 0), [cart, cartProducts]);
  const deliveryPrice = 0;
  const hasFreeDelivery = subtotal >= 1500;
  const promoDiscount = promoCode === "ASAYA10" ? Math.round(subtotal * 0.1) : 0;
  const productDiscount = oldSubtotal - subtotal;
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
        <h1>Оформление заказа</h1>
      </header>

      <form className={styles.checkoutGrid} onSubmit={submit}>
        <div className={styles.leftColumn}>
          <section className={styles.block} aria-labelledby="cart-heading">
            <div className={styles.blockHeading}>
              <h2 id="cart-heading">Товары в заказе</h2>
              <Link href="/cart">Изменить</Link>
            </div>
            {cartProducts.length ? (
              <div className={styles.cartList}>
                {cartProducts.map((product) => (
                  <article className={styles.cartItem} key={product.id}>
                    <Link className={styles.cartImage} href={`/product/${product.id}`}><Image alt={product.name} fill sizes="120px" src={product.image} /></Link>
                    <span>{cart[product.id]} шт.</span>
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
            <label className={styles.city} htmlFor="city"><strong id="delivery-heading">Ваш город</strong><span><b aria-hidden="true">⌕</b><input defaultValue="Москва, Россия" id="city" required={cartProducts.length > 0} /></span></label>
            <div className={styles.deliveryHeading}>
              <h2>Выберите способ доставки</h2>
              <p>Сборка заказа занимает 1–2 дня, скорость доставки зависит от выбранной логистической службы.</p>
            </div>
            <div className={styles.deliveryCard}>
              <label className={styles.deliveryChoice}><input defaultChecked name="delivery" type="radio" /><span><strong>Пункт выдачи или курьер</strong><b>Готовим подключение Ozon Доставки и СДЭК</b></span></label>
              <small>После подключения службы здесь появятся доступные ПВЗ, курьерские интервалы, точный срок и стоимость. Мы не показываем выдуманные варианты доставки до ответа логистического сервиса.</small>
              <button onClick={(event) => { event.preventDefault(); document.getElementById("pickup")?.focus(); }} type="button">Указать желаемый ПВЗ</button>
              <label className={styles.pickupField} htmlFor="pickup">Пункт выдачи<input id="pickup" placeholder="Адрес, метро или район" required={cartProducts.length > 0} /></label>
              <em>{hasFreeDelivery ? "Доставка будет бесплатной: сумма товаров от 1 500 ₽" : "Точную стоимость рассчитает служба доставки"}</em>
            </div>
          </section>

          <section className={styles.block} aria-labelledby="customer-heading">
            <h2 id="customer-heading">Заполните информацию о себе</h2>
            <div className={styles.fieldGrid}>
              <label>Фамилия<input required={cartProducts.length > 0} /></label>
              <label>Имя<input required={cartProducts.length > 0} /></label>
              <label>Телефон<input placeholder="+7 000 000-00-00" required={cartProducts.length > 0} type="tel" /></label>
              <label>Email<input placeholder="name@example.com" required={cartProducts.length > 0} type="email" /></label>
              <label className={styles.fullWidth}>Адрес доставки (если ПВЗ не выбран)<input /></label>
            </div>
          </section>

          <section className={styles.block} aria-labelledby="payment-heading">
            <h2 id="payment-heading">Оплата</h2>
            <label className={styles.payment}><input defaultChecked name="payment" type="radio" /><span><strong>Банковской картой на сайте</strong><small>МИР · Visa · Mastercard</small></span></label>
          </section>
        </div>

        <aside className={styles.summary} aria-labelledby="summary-heading">
          <div className={styles.summaryRows}>
            <div><span>Всего {itemCount} товар(а) на сумму</span><strong>{formatPrice(oldSubtotal)}</strong></div>
            <div><span>Доставка</span><strong>{hasFreeDelivery ? "Бесплатно" : "После выбора ПВЗ"}</strong></div>
            {(productDiscount + promoDiscount) > 0 && <div><span>Скидка{promoDiscount ? " + промокод" : ""}</span><strong>−{formatPrice(productDiscount + promoDiscount)}</strong></div>}
          </div>
          <div className={styles.summaryTotal}><h2 id="summary-heading">Итого к оплате</h2><strong>{formatPrice(total)}</strong></div>
          <button disabled={!cartProducts.length} type="submit"><span>Оформить заказ</span><strong>{formatPrice(total)}</strong></button>
          <label className={styles.agreement}><input required type="checkbox" /><span>Я согласен с <Link href="/legal/offer">условиями оферты</Link>, <Link href="/legal/privacy">политикой конфиденциальности</Link> и <Link href="/legal/personal-data">обработкой персональных данных</Link></span></label>
          <label className={styles.agreement}><input type="checkbox" />Я согласен получать рекламные и информационные материалы</label>
          <span className={styles.note}>Демо-режим: заказ не отправляется без подключения защищённого сервера. {hasFreeDelivery ? "Доставка включена в итог." : "Итог пока указан без доставки."}</span>
        </aside>
      </form>
    </main>
  );
}
