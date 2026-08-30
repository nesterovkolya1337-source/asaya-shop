"use client";

import Link from "next/link";
import { ProductCard } from "@/components/product-card";
import { useShop } from "@/components/shop-provider";
import styles from "./favorites-view.module.css";

export function FavoritesView() {
  const { favorites, products } = useShop();
  const favoriteProducts = products.filter((product) => product.active && favorites.includes(product.id));
  const recentlyViewed = products.find((product) => product.active && !favorites.includes(product.id)) ?? products[0];

  return (
    <main className={styles.main}>
      {favoriteProducts.length ? (
        <section className={styles.saved}>
          <h1>Избранное ({favoriteProducts.length})</h1>
          <div className={styles.grid}>
            {favoriteProducts.map((product) => <ProductCard key={product.id} product={product} />)}
          </div>
        </section>
      ) : (
        <>
          <section className={styles.empty}>
            <h1>Пока нет сохранённых товаров</h1>
            <Link href="/catalog">Добавить товары</Link>
          </section>
          {recentlyViewed && (
            <section className={styles.recent}>
              <h2>Ранее вы смотрели</h2>
              <div className={styles.recentGrid}><ProductCard product={recentlyViewed} /></div>
            </section>
          )}
        </>
      )}
    </main>
  );
}
