"use client";

import {CroppedImage} from './cropped-image';
import Image from "next/image";
import Link from "next/link";
import { useShop } from "@/components/shop-provider";
import { assetPath } from "@/lib/asset-path";
import { formatPrice, type Product } from "@/lib/store-data";
import { useProductImpression } from './product-analytics';
import { getProductAnalytics } from '@/lib/product-analytics';
import { getMetrika } from '@/lib/metrika';
import styles from "./product-card.module.css";

export function ProductCard({ product }: { product: Product }) {
  const { addToCart, cart, changeQuantity, favorites, toggleFavorite, catalogOnly, checkoutEnabled } = useShop();
  const analyticsRef=useProductImpression(product.sku);
  const isFavorite = favorites.includes(product.id);
  const quantity = cart[product.id] ?? 0;

  return (
    <article ref={analyticsRef} className={styles.card} id={product.id}>
      <div className={styles.badges}>
        {product.badge && <span>{product.badge}</span>}
        {product.discount > 0 && <span className={styles.discountBadge}>−{product.discount}%</span>}
      </div>
      <Link className={styles.visualLink} href={`/product/${product.id}`} aria-label={`Открыть ${product.name}`} onClick={() => {getMetrika()?.productClick(product);getProductAnalytics()?.track('product_click',product.sku);}}>
        <CroppedImage
          alt={product.name}
          className={styles.image}
          fill
          sizes="(max-width: 520px) 46vw, (max-width: 900px) 44vw, 370px"
          crop={product.imageCrops?.[product.image]} src={product.image}
        />
      </Link>
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
          <h3>{product.name}</h3>
        </div>
        <div className={styles.price}>
          <strong>{formatPrice(product.price)}</strong>
          <div>
            {product.oldPrice > product.price && <span>{formatPrice(product.oldPrice)}</span>}
          </div>
        </div>
      </div>
      {quantity && product.stock>0 ? (
        <div className={styles.cartControl} aria-label={`Количество ${product.name} в корзине`}>
          <button aria-label={`Уменьшить количество ${product.name}`} onClick={() => changeQuantity(product.id, quantity - 1)} type="button">−</button>
          <span>{quantity}</span>
          <button aria-label={`Увеличить количество ${product.name}`} disabled={quantity >= product.stock} onClick={() => changeQuantity(product.id, quantity + 1)} type="button">+</button>
        </div>
      ) : (
        <button
          className={styles.addButton}
          disabled={(catalogOnly && !checkoutEnabled && !product.testMode) || !product.stock}
          onClick={() => addToCart(product.id)}
          type="button"
        >
          {!product.stock ? "Нет в наличии" : catalogOnly && !checkoutEnabled && !product.testMode ? "Продажи пока закрыты" : "В корзину"}
        </button>
      )}
    </article>
  );
}
