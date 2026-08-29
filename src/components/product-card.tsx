"use client";

import Image from "next/image";
import { useShop } from "@/components/shop-provider";
import { assetPath } from "@/lib/asset-path";
import { formatPrice, type Product } from "@/lib/store-data";
import styles from "./product-card.module.css";

export function ProductCard({ product }: { product: Product }) {
  const { addToCart, cart, changeQuantity, favorites, toggleFavorite } = useShop();
  const isFavorite = favorites.includes(product.id);
  const quantity = cart[product.id] ?? 0;

  return (
    <article className={styles.card} id={product.id}>
      <div className={styles.badges}>
        {product.badge && <span>{product.badge}</span>}
      </div>
      <Image
        alt={product.name}
        className={styles.image}
        fill
        sizes="(max-width: 520px) 46vw, (max-width: 900px) 44vw, 370px"
        src={product.image}
      />
      <button
        aria-label={isFavorite ? `Убрать ${product.name} из избранного` : `Добавить ${product.name} в избранное`}
        aria-pressed={isFavorite}
        className={`${styles.favorite} ${isFavorite ? styles.favoriteActive : ""}`}
        onClick={() => toggleFavorite(product.id)}
        type="button"
      >
        <Image alt="" height={21} src={assetPath("/images/figma/heart.svg")} width={23} />
      </button>
      <div className={styles.info}>
        <div className={styles.meta}>
          <div className={styles.rating}>
            <Image alt={`${product.rating} из 5`} height={12} src={assetPath("/images/figma/stars.svg")} width={58} />
            <span>({product.reviews})</span>
          </div>
          <h3>{product.name}</h3>
        </div>
        <div className={styles.price}>
          <strong>{formatPrice(product.price)}</strong>
          <div>
            {product.oldPrice > product.price && <span>{formatPrice(product.oldPrice)}</span>}
            {product.discount > 0 && <em>-{product.discount}%</em>}
          </div>
        </div>
      </div>
      {quantity ? (
        <div className={styles.cartControl} aria-label={`Количество ${product.name} в корзине`}>
          <button aria-label={`Уменьшить количество ${product.name}`} onClick={() => changeQuantity(product.id, quantity - 1)} type="button">−</button>
          <span>{quantity}</span>
          <button aria-label={`Увеличить количество ${product.name}`} disabled={quantity >= product.stock} onClick={() => changeQuantity(product.id, quantity + 1)} type="button">+</button>
        </div>
      ) : (
        <button
          className={styles.addButton}
          disabled={!product.stock}
          onClick={() => addToCart(product.id)}
          type="button"
        >
          {!product.stock ? "Нет в наличии" : "В корзину"}
        </button>
      )}
    </article>
  );
}
