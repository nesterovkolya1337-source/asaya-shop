"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";
import { ProductCard } from "@/components/product-card";
import { useShop } from "@/components/shop-provider";
import styles from "./account-view.module.css";

export function AccountView() {
  const { favorites, login, logout, products, reviews, userEmail } = useShop();
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState(false);
  const favoriteProducts = products.filter((product) => favorites.includes(product.id) && product.active);
  const ownReviews = reviews.filter((review) => review.email === userEmail);

  function requestLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    login(email);
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
          {userEmail ? (
            <>
              <p>Профиль на этом устройстве</p>
              <h2>{userEmail}</h2>
              <span>Можно сохранять избранное и отправлять отзывы на модерацию. Для синхронизации между устройствами потребуется серверный вход.</span>
              <div className={styles.profileStats}>
                <div><strong>{ownReviews.length}</strong><span>отзывов отправлено</span></div>
                <div><strong>{ownReviews.filter((review) => review.status === "approved").length}</strong><span>опубликовано</span></div>
                <div><strong>{ownReviews.filter((review) => review.status === "pending").length}</strong><span>на проверке</span></div>
              </div>
              <button className={styles.logoutButton} onClick={logout} type="button">Выйти</button>
            </>
          ) : (
            <>
              <p>Вход в рабочий прототип</p>
              <h2>Войдите, чтобы оставить отзыв</h2>
              <span>Email сохраняется только в этом браузере и никуда не отправляется.</span>
              <form onSubmit={requestLogin}>
                <label>Email<input onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" required type="email" value={email} /></label>
                <button type="submit">Продолжить</button>
              </form>
              {notice && <div className={styles.notice} role="status">Профиль создан на этом устройстве.</div>}
            </>
          )}
        </section>

        <section className={styles.orders}>
          <p>История заказов</p>
          <h2>Заказов пока нет</h2>
          <span>После подключения защищённого кабинета здесь появятся состав заказа и его статус.</span>
          <div className={styles.orderActions}>
            <Link href="/order-status">Проверить статус</Link>
            <Link href="/catalog">Перейти в каталог</Link>
          </div>
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
