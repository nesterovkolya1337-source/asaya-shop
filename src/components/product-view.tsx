"use client";
import {ProductPurchaseActions} from './product-purchase-actions';
import {ProductRichContent} from './product-rich-content';
import {pdpRecommendations,pdpStockLabel} from '@/lib/pdp-presentation';
import {ProductReviews} from './customer-engagement';
import { CarouselArrow } from "@/components/carousel-arrow";

import {CroppedImage} from './cropped-image';
import Image from "next/image";
import Link from "next/link";
import { type MouseEvent, type PointerEvent, useEffect, useRef, useState } from "react";
import { ProductCard } from "@/components/product-card";
import { useShop } from "@/components/shop-provider";
import { assetPath } from "@/lib/asset-path";
import { categoryLabels, formatPrice } from "@/lib/store-data";
import styles from "./product-view.module.css";

export function ProductView({ productId }: { productId: string }) {
  const { favorites, products, toggleFavorite, catalogOnly, catalogStatus } = useShop();
  const [activeImage, setActiveImage] = useState(0);
  const [recommendationDragging, setRecommendationDragging] = useState(false);
  const recommendationDrag = useRef({ active: false, moved: false, pointerId: -1, startX: 0, startY: 0, scrollLeft: 0 });
  const recommendationRail = useRef<HTMLDivElement>(null);
  const product = products.find((item) => item.id === productId && item.active);

  const mainActions = useRef<HTMLDivElement>(null);
  const [showSticky, setShowSticky] = useState(false);
  useEffect(() => {
    setShowSticky(false);
    const target = mainActions.current;
    if (!target) return;
    // Do not show the bar while the initial CTA is still below the viewport.
    const observer = new IntersectionObserver(([entry]) => {
      setShowSticky(!entry.isIntersecting && entry.boundingClientRect.bottom <= 72);
    }, {threshold: 0, rootMargin: "-72px 0px 0px 0px"});
    observer.observe(target);
    return () => observer.disconnect();
  }, [product?.id]);

  if (!product) {
    return (
      <main className={styles.notFound}>
        <p>{catalogStatus === 'loading' ? 'Загружаем товар…' : catalogStatus === 'error' ? 'Не удалось загрузить товар.' : catalogOnly ? 'Товар пока недоступен для продажи.' : 'Товар не найден'}</p>
        <h1>Вернёмся к каталогу?</h1>
        <Link href="/catalog">Смотреть все продукты</Link>
      </main>
    );
  }

  const isFavorite = favorites.includes(product.id);
  // A recommended card must remain in place after Add so its shared-cart stepper is usable.
  const recommendations = pdpRecommendations(products,product);
  const gallery = [...new Set([product.image, ...product.gallery].filter(Boolean))];
  const startRecommendationDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse" || !event.isPrimary || event.button !== 0) return;
    recommendationDrag.current = {
      active: true,
      moved: false,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: event.currentTarget.scrollLeft,
    };
  };
  const moveRecommendationDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!recommendationDrag.current.active || recommendationDrag.current.pointerId !== event.pointerId) return;
    const distanceX = event.clientX - recommendationDrag.current.startX;
    const distanceY = event.clientY - recommendationDrag.current.startY;
    if (!recommendationDrag.current.moved && Math.abs(distanceX) < 6) return;
    if (!recommendationDrag.current.moved && Math.abs(distanceY) > Math.abs(distanceX)) return;
    if (!recommendationDrag.current.moved) {
      recommendationDrag.current.moved = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      setRecommendationDragging(true);
    }
    event.preventDefault();
    event.currentTarget.scrollLeft = recommendationDrag.current.scrollLeft - distanceX;
  };
  const stopRecommendationDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (recommendationDrag.current.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    recommendationDrag.current.active = false;
    recommendationDrag.current.pointerId = -1;
    setRecommendationDragging(false);
  };
  const blockRecommendationClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!recommendationDrag.current.moved) return;
    event.preventDefault();
    event.stopPropagation();
    recommendationDrag.current.moved = false;
  };

  const scrollRecommendations = (direction: -1 | 1) => {
    recommendationRail.current?.scrollBy({ left: direction * Math.max(300, recommendationRail.current.clientWidth * 0.72), behavior: "smooth" });
  };

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
            <CroppedImage
              alt={`${product.name} — фото ${activeImage + 1}`}
              className={`${styles.productImage} ${activeImage > 0 ? styles.lifestyleImage : ""}`}
              fill
              priority
              sizes="(max-width: 760px) 94vw, 54vw"
              crop={product.imageCrops?.[gallery[activeImage] ?? gallery[0]]} src={gallery[activeImage] ?? gallery[0]}
            />
            <span className={styles.volume}>{product.volume}</span>
          </div>
          <div className={styles.thumbnails} aria-label="Фотографии товара">
            {gallery.map((image, index) => (
              <button aria-label={`Показать фото ${index + 1}`} aria-pressed={activeImage === index} className={activeImage === index ? styles.activeThumbnail : ""} key={image} onClick={() => setActiveImage(index)} type="button">
                <CroppedImage crop={product.imageCrops?.[image]} alt="" fill sizes="100px" src={image} />
              </button>
            ))}
          </div>
        </div>

        <div className={styles.details} tabIndex={0} role="region" aria-label="Информация о товаре">

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
          <p className={styles.stock}>{pdpStockLabel(product)}</p>

          <div ref={mainActions} data-main-buy className={styles.mainActions}>
            <ProductPurchaseActions product={product} addLabel="Добавить в корзину"/>
          </div>
          <p className={styles.checkoutNote}>Оформление и оплата — в Яндексе. Регистрация на ASAYA не нужна.</p>
          <ul className={styles.features}>
            {product.features.map((feature) => <li key={feature}>{feature}</li>)}
          </ul>

          <div className={styles.accordions}>
            <details>
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
              <p>Доставляем по России в ПВЗ СДЭК. При заказе от 1 000 ₽ стандартную доставку оплачивает ASAYA. Стоимость и срок для выбранного пункта выдачи уточняются при оформлении.</p>
            </details>
          </div>
        </div>
      </section>

      {product.sku&&<ProductReviews sku={product.sku} slug={product.id}/>}
      <ProductRichContent content={product.pdp}/>

      {recommendations.length>0&&<section className={styles.recommendations} aria-labelledby="recommendations-title">
        <div className={styles.sectionHeading}>
          <h2 id="recommendations-title">Рекомендуем</h2>
          <div className={styles.recommendationActions}>
            <Link href="/catalog">Весь каталог</Link>
            <div className={styles.sliderArrows}>
              <button aria-label="Предыдущие рекомендации" onClick={() => scrollRecommendations(-1)} type="button"><CarouselArrow previous /></button>
              <button aria-label="Следующие рекомендации" onClick={() => scrollRecommendations(1)} type="button"><CarouselArrow /></button>
            </div>
          </div>
        </div>
        <div
          className={`${styles.recommendationGrid} ${recommendationDragging ? styles.recommendationDragging : ""}`}
          onClickCapture={blockRecommendationClick}
          onDragStart={(event) => event.preventDefault()}
          onLostPointerCapture={stopRecommendationDrag}
          onPointerCancel={stopRecommendationDrag}
          onPointerDown={startRecommendationDrag}
          onPointerMove={moveRecommendationDrag}
          onPointerUp={stopRecommendationDrag}
          ref={recommendationRail}
        >
          {recommendations.map((item) => <ProductCard key={item.id} product={item} recommendation />)}
        </div>
      </section>
      }
      <aside data-visible={showSticky} className={styles.stickyBuy} aria-label="Быстрая покупка">
        <div><small>{product.name}</small><strong>{formatPrice(product.price)}</strong></div>
        <ProductPurchaseActions product={product} addLabel="Добавить в корзину"/>

      </aside>
    </main>
  );
}
