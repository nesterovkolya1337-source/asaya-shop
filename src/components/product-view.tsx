"use client";

import Image from "next/image";
import Link from "next/link";
import { ProductCard } from "@/components/product-card";
import { useShop } from "@/components/shop-provider";
import { assetPath } from "@/lib/asset-path";
import { categoryLabels, formatPrice } from "@/lib/store-data";
import styles from "./product-view.module.css";

export function ProductView({ productId }: { productId: string }) {
  const { addToCart, cart, changeQuantity, favorites, products, toggleFavorite } = useShop();
  const product = products.find((item) => item.id === productId);

  if (!product) {
    return (
      <main className={styles.notFound}>
        <p>Товар не найден</p>
        <h1>Вернёмся к каталогу?</h1>
        <Link href="/catalog">Смотреть все продукты</Link>
      </main>
    );
  }

  const quantity = cart[product.id] ?? 0;
  const isFavorite = favorites.includes(product.id);
  const recommendations = products.filter((item) => item.active && item.id !== product.id).slice(0, 3);

  return (
    <main className={styles.main}>
      <nav aria-label="Хлебные крошки" className={styles.breadcrumbs}>
        <Link href="/">ASAYA</Link><span>/</span>
        <Link href={`/catalog/${product.category}`}>{categoryLabels[product.category]}</Link><span>/</span>
        <span>{product.name}</span>
      </nav>

      <section className={styles.product} aria-labelledby="product-title">
        <div className={styles.gallery}>
          {product.badge && <span className={styles.badge}>{product.badge}</span>}
          <Image
            alt={product.name}
            className={styles.productImage}
            fill
            priority
            sizes="(max-width: 760px) 94vw, 54vw"
            src={product.image}
          />
          <span className={styles.volume}>{product.volume}</span>
        </div>

        <div className={styles.details}>
          <div className={styles.rating}>
            <Image alt={`${product.rating} из 5`} height={14} src={assetPath("/images/figma/stars.svg")} width={68} />
            <span>{product.reviews} отзывов</span>
          </div>
          <div className={styles.titleRow}>
            <h1 id="product-title">{product.name}</h1>
            <button
              aria-label={isFavorite ? `Убрать ${product.name} из избранного` : `Добавить ${product.name} в избранное`}
              aria-pressed={isFavorite}
              className={`${styles.favorite} ${isFavorite ? styles.favoriteActive : ""}`}
              onClick={() => toggleFavorite(product.id)}
              type="button"
            >
              <Image alt="" height={23} src={assetPath("/images/figma/heart.svg")} width={25} />
            </button>
          </div>
          <p className={styles.description}>{product.description}</p>

          <div className={styles.priceBlock}>
            <strong>{formatPrice(product.price)}</strong>
            {product.oldPrice > product.price && <span>{formatPrice(product.oldPrice)}</span>}
            {product.discount > 0 && <em>−{product.discount}%</em>}
          </div>
          <p className={styles.stock}>{product.stock > 0 ? `В наличии · ${product.stock} шт.` : "Нет в наличии"}</p>

          <div className={styles.buyArea}>
            {quantity ? (
              <div className={styles.quantity} aria-label={`Количество ${product.name} в корзине`}>
                <button aria-label={`Уменьшить количество ${product.name}`} onClick={() => changeQuantity(product.id, quantity - 1)} type="button">−</button>
                <span>{quantity}</span>
                <button aria-label={`Увеличить количество ${product.name}`} disabled={quantity >= product.stock} onClick={() => changeQuantity(product.id, quantity + 1)} type="button">+</button>
              </div>
            ) : (
              <button className={styles.addButton} disabled={!product.stock} onClick={() => addToCart(product.id)} type="button">
                {product.stock ? "Добавить в корзину" : "Нет в наличии"}
              </button>
            )}
            {quantity > 0 && <Link className={styles.checkoutLink} href="/checkout">Перейти к оформлению</Link>}
          </div>

          <ul className={styles.features}>
            {product.features.map((feature) => <li key={feature}>{feature}</li>)}
          </ul>

          <div className={styles.accordions}>
            <details open>
              <summary>Как использовать</summary>
              <p>{product.usage}</p>
            </details>
            <details>
              <summary>Состав и свойства</summary>
              <p>{product.ingredients}</p>
            </details>
            <details>
              <summary>Доставка и оплата</summary>
              <p>Бесплатная доставка при заказе от 1 500 ₽. Доступны пункт выдачи и курьерская доставка.</p>
            </details>
          </div>
        </div>
      </section>

      <section className={styles.recommendations} aria-labelledby="recommendations-title">
        <div className={styles.sectionHeading}>
          <h2 id="recommendations-title">Попробуй ещё</h2>
          <Link href="/catalog">Весь каталог</Link>
        </div>
        <div className={styles.recommendationGrid}>
          {recommendations.map((item) => <ProductCard key={item.id} product={item} />)}
        </div>
      </section>
    </main>
  );
}
