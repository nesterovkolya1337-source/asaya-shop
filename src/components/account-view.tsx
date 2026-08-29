"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";
import { ProductCard } from "@/components/product-card";
import { useShop } from "@/components/shop-provider";
import styles from "./account-view.module.css";

export function AccountView() {
  const { favorites, products } = useShop();
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState(false);
  const favoriteProducts = products.filter((product) => favorites.includes(product.id) && product.active);

  function requestLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(true);
  }

  return (
    <main className={styles.main}>
      <header className={styles.heading}>
        <p>ASAYA / Профиль</p>
        <h1>Личный кабинет</h1>
        <span>Заказы, избранное и персональные предложения в одном месте.</span>
      </header>

      <div className={styles.dashboard}>
        <section className={styles.loginCard}>
          <div className={styles.lock} aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg></div>
          <p>Защищённый вход</p>
          <h2>Ваши данные должны оставаться только вашими</h2>
          <span>Вход будет включён вместе с серверной авторизацией, подтверждением почты и безопасными HttpOnly-cookie.</span>
          <form onSubmit={requestLogin}>
            <label>Email<input onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" required type="email" value={email} /></label>
            <button type="submit">Продолжить</button>
          </form>
          {notice && <div className={styles.notice} role="status">Данные не отправлены и не сохранены: защищённый серверный вход ещё не подключён.</div>}
        </section>

        <section className={styles.orders}>
          <p>История заказов</p>
          <h2>Заказов пока нет</h2>
          <span>После подключения защищённого кабинета здесь появятся состав заказа и его статус.</span>
          <Link href="/catalog">Перейти в каталог</Link>
        </section>
      </div>

      <section className={styles.favorites} id="favorites">
        <div className={styles.sectionHeading}>
          <h2>Избранное на этом устройстве</h2>
          <span>{favoriteProducts.length}</span>
        </div>
        {favoriteProducts.length ? (
          <div className={styles.favoriteGrid}>
            {favoriteProducts.map((product) => <ProductCard key={product.id} product={product} />)}
          </div>
        ) : (
          <div className={styles.emptyFavorites}>
            <p>Нажимайте на сердечко в карточках — продукты появятся здесь.</p>
            <Link href="/catalog">Выбрать продукты</Link>
          </div>
        )}
      </section>
    </main>
  );
}
