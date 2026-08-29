"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";
import { ProductCard } from "@/components/product-card";
import { useShop } from "@/components/shop-provider";
import styles from "./account-view.module.css";

export function AccountView() {
  const { favorites, products, profile, saveProfile } = useShop();
  const [draft, setDraft] = useState(profile);
  const [saved, setSaved] = useState(false);
  const favoriteProducts = products.filter((product) => favorites.includes(product.id) && product.active);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    saveProfile(draft);
    setSaved(true);
  }

  return (
    <main className={styles.main}>
      <header className={styles.heading}>
        <p>ASAYA / Профиль</p>
        <h1>Личный кабинет</h1>
        <span>Контакты, избранное и история заказов в одном месте.</span>
      </header>

      <div className={styles.dashboard}>
        <form className={styles.profileCard} onSubmit={submit}>
          <div className={styles.cardHeading}>
            <div>
              <p>Профиль</p>
              <h2>{profile.name || "Добро пожаловать"}</h2>
            </div>
            <span className={styles.avatar}>{(profile.name || "A").slice(0, 1).toUpperCase()}</span>
          </div>
          <div className={styles.fields}>
            <label>Имя<input onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Ваше имя" value={draft.name} /></label>
            <label>Email<input onChange={(event) => setDraft({ ...draft, email: event.target.value })} placeholder="name@example.com" type="email" value={draft.email} /></label>
            <label>Телефон<input onChange={(event) => setDraft({ ...draft, phone: event.target.value })} placeholder="+7 000 000-00-00" type="tel" value={draft.phone} /></label>
          </div>
          <button type="submit">{saved ? "Сохранено" : "Сохранить профиль"}</button>
        </form>

        <section className={styles.orders}>
          <p>История заказов</p>
          <h2>Заказов пока нет</h2>
          <span>После первой покупки здесь появятся состав заказа и его статус.</span>
          <Link href="/catalog">Перейти в каталог</Link>
        </section>
      </div>

      <section className={styles.favorites} id="favorites">
        <div className={styles.sectionHeading}>
          <h2>Избранное</h2>
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
