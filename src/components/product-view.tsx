"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { ProductCard } from "@/components/product-card";
import { useShop } from "@/components/shop-provider";
import { assetPath } from "@/lib/asset-path";
import { categoryLabels, formatPrice } from "@/lib/store-data";
import styles from "./product-view.module.css";

export function ProductView({ productId }: { productId: string }) {
  const { addToCart, cart, changeQuantity, favorites, products, toggleFavorite } = useShop();
  const [activeImage, setActiveImage] = useState(0);
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
  const gallery = product.gallery.length ? product.gallery : [product.image];
  const ugcImages = [
    assetPath("/images/figma/ugc-000012160039.webp"),
    assetPath("/images/figma/ugc-img3456.webp"),
    assetPath("/images/figma/ugc-img5872.webp"),
    assetPath("/images/figma/ugc-red-product.webp"),
  ];

  return (
    <main className={styles.main}>
      <nav aria-label="Хлебные крошки" className={styles.breadcrumbs}>
        <Link href="/">ASAYA</Link><span>/</span>
        <Link href={`/catalog/${product.category}`}>{categoryLabels[product.category]}</Link><span>/</span>
        <span>{product.name}</span>
      </nav>

      <section className={styles.product} aria-labelledby="product-title">
        <div className={styles.galleryColumn}>
          <div className={styles.gallery}>
            <div className={styles.productBadges}>
              {product.badge && <span className={styles.badge}>{product.badge}</span>}
              {product.discount > 0 && <span className={styles.discountBadge}>−{product.discount}%</span>}
            </div>
            <Image
              alt={`${product.name} — фото ${activeImage + 1}`}
              className={`${styles.productImage} ${activeImage > 0 ? styles.lifestyleImage : ""}`}
              fill
              priority
              sizes="(max-width: 760px) 94vw, 54vw"
              src={gallery[activeImage] ?? gallery[0]}
            />
            <span className={styles.volume}>{product.volume}</span>
          </div>
          <div className={styles.thumbnails} aria-label="Фотографии товара">
            {gallery.map((image, index) => (
              <button aria-label={`Показать фото ${index + 1}`} aria-pressed={activeImage === index} className={activeImage === index ? styles.activeThumbnail : ""} key={image} onClick={() => setActiveImage(index)} type="button">
                <Image alt="" fill sizes="100px" src={image} />
              </button>
            ))}
          </div>
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
              <Link className={styles.instructionLink} href={`/instructions/${product.id}`}>Подробная инструкция →</Link>
            </details>
            <details>
              <summary>Аромат</summary>
              <p>{product.aroma}</p>
            </details>
            <details>
              <summary>Состав</summary>
              <p>{product.ingredients}</p>
            </details>
            <details>
              <summary>Доставка и оплата</summary>
              <p>Бесплатная доставка при заказе от 1 500 ₽. Доступны пункт выдачи и курьерская доставка.</p>
            </details>
          </div>
        </div>
      </section>

      <section className={styles.sensory} aria-labelledby="sensory-title">
        <div>
          <p>Сенсорный профиль</p>
          <h2 id="sensory-title">Комфорт, который ощущается</h2>
          <span>Мы описываем не обещание «идеального результата», а характер продукта во время и после использования.</span>
        </div>
        <div className={styles.sensoryMetrics}>
          {product.sensory.map((metric) => (
            <div key={metric.label}>
              <span>{metric.label}</span>
              <div aria-label={`${metric.label}: ${metric.value} из 5`} className={styles.sensoryDots}>
                {Array.from({ length: 5 }, (_, index) => <i className={index < metric.value ? styles.filledDot : ""} key={index} />)}
              </div>
            </div>
          ))}
          <small>Сенсорное описание, а не лабораторная оценка эффективности.</small>
        </div>
      </section>

      <section className={styles.ugc} aria-labelledby="ugc-title">
        <div className={styles.sectionHeading}>
          <div><p>Съёмки и сообщество бренда</p><h2 id="ugc-title">ASAYA в жизни</h2></div>
        </div>
        <div className={styles.ugcGrid}>
          {ugcImages.map((image, index) => (
            <div className={styles.ugcImage} key={image}><Image alt={`ASAYA в жизни — кадр ${index + 1}`} fill sizes="(max-width: 620px) 46vw, 25vw" src={image} /></div>
          ))}
        </div>
      </section>

      <section className={styles.reviews} aria-labelledby="reviews-title">
        <div className={styles.reviewSummary}>
          <p>Отзывы</p>
          <h2 id="reviews-title">{product.rating.toFixed(1)}</h2>
          <div><Image alt={`${product.rating} из 5`} height={16} src={assetPath("/images/figma/stars.svg")} width={78} /><span>{product.reviews} оценок в текущей карточке товара</span></div>
        </div>
        <div className={styles.reviewState}>
          <h3>Тексты отзывов появятся здесь после подключения защищённого кабинета</h3>
          <p>Пользователь сможет поставить 1–5 звёзд, написать текст и приложить фотографии. Отзыв с заказом получит отметку «Покупка подтверждена».</p>
          <Link href="/account">Войти, чтобы оставить отзыв</Link>
          <small>Мы не публикуем рекламные тексты под видом отзывов покупателей.</small>
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
