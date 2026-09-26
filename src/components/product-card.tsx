"use client";
import {ProductRating} from './product-rating';

import {productMediaFrames} from '@/lib/product-media-frame';
import {ProductPurchaseActions} from './product-purchase-actions';
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

export function ProductCard({ product, recommendation=false,interactionsDisabled=false }: { product: Product; recommendation?:boolean;interactionsDisabled?:boolean }) {
  const { favorites, toggleFavorite } = useShop();
  const analyticsRef=useProductImpression(product.sku);
  const isFavorite = favorites.includes(product.id);
  const frame = productMediaFrames[product.image];

  return (
    <article ref={analyticsRef} className={styles.card} id={product.id}>
      <div className={styles.badges}>
        {product.badge && <span>{product.badge}</span>}
        {product.discount > 0 && <span className={styles.discountBadge}>−{product.discount}%</span>}
      </div>
      <Link className={styles.visualLink} href={`/product/${product.id}`} aria-label={`Открыть ${product.name}`} onClick={() => {getMetrika()?.productClick(product);getProductAnalytics()?.track('product_click',product.sku);}}>
        {frame?<svg className={styles.image} viewBox={frame.viewBox} preserveAspectRatio="xMidYMid meet" role="img" aria-label={product.name}><image href={assetPath(product.image)} width={frame.width} height={frame.height}/></svg>:<CroppedImage
          alt={product.name}
          className={styles.image}
          fill
          sizes="(max-width: 520px) 46vw, (max-width: 900px) 44vw, 370px"
          src={product.image}
        />}
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
        <div className={styles.rating}><ProductRating rating={product.rating} count={product.reviews} compact/></div>
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
      <div className={styles.actions}><ProductPurchaseActions product={product} compact quickBuy={false} interactionsDisabled={interactionsDisabled}/></div>
    </article>
  );
}
