"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ChangeEvent, type FormEvent, type MouseEvent, type PointerEvent, useRef, useState } from "react";
import { ProductCard } from "@/components/product-card";
import { useShop } from "@/components/shop-provider";
import { assetPath } from "@/lib/asset-path";
import { categoryLabels, formatPrice } from "@/lib/store-data";
import styles from "./product-view.module.css";

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function ProductView({ productId }: { productId: string }) {
  const { addReview, addToCart, cart, changeQuantity, favorites, products, reviews, toggleFavorite, userEmail } = useShop();
  const router = useRouter();
  const [activeImage, setActiveImage] = useState(0);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewText, setReviewText] = useState("");
  const [reviewPhotos, setReviewPhotos] = useState<string[]>([]);
  const [reviewNotice, setReviewNotice] = useState("");
  const [recommendationDragging, setRecommendationDragging] = useState(false);
  const recommendationDrag = useRef({ active: false, moved: false, pointerId: -1, startX: 0, startY: 0, scrollLeft: 0 });
  const recommendationRail = useRef<HTMLDivElement>(null);
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
  const approvedReviews = reviews.filter((review) => review.productId === product.id && review.status === "approved");
  const pendingReview = reviews.find((review) => review.productId === product.id && review.email === userEmail && review.status === "pending");
  const recommendations = product.recommendations.map((id) => products.find((item) => item.id === id)).filter((item) => item?.active && item.id !== product.id).filter((item): item is NonNullable<typeof item> => Boolean(item));
  const gallery = product.gallery.length ? product.gallery : [product.image];
  const hasReviews = product.reviews > 0;
  const ratingRows = [5, 4, 3, 2, 1];
  const buyNow = () => {
    if (!quantity && product.stock) addToCart(product.id);
    router.push("/checkout");
  };
  const startRecommendationDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
    recommendationDrag.current = {
      active: true,
      moved: false,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: event.currentTarget.scrollLeft,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setRecommendationDragging(true);
  };
  const moveRecommendationDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!recommendationDrag.current.active || recommendationDrag.current.pointerId !== event.pointerId) return;
    const distanceX = event.clientX - recommendationDrag.current.startX;
    const distanceY = event.clientY - recommendationDrag.current.startY;
    if (!recommendationDrag.current.moved && Math.abs(distanceX) < 6) return;
    if (!recommendationDrag.current.moved && Math.abs(distanceY) > Math.abs(distanceX)) return;
    recommendationDrag.current.moved = true;
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
  const addPhotos = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).filter((file) => file.type.startsWith("image/")).slice(0, 2);
    if (files.some((file) => file.size > 900_000)) {
      setReviewNotice("Каждое фото должно быть меньше 900 КБ.");
      event.target.value = "";
      return;
    }
    const photos = await Promise.all(files.map(fileToDataUrl));
    setReviewPhotos(photos);
    setReviewNotice("");
  };
  const submitReview = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!userEmail || reviewText.trim().length < 10) {
      setReviewNotice("Добавьте впечатление длиной не меньше 10 символов.");
      return;
    }
    addReview({ email: userEmail, photos: reviewPhotos, productId: product.id, rating: reviewRating, text: reviewText.trim() });
    setReviewText("");
    setReviewPhotos([]);
    setReviewNotice("Отзыв отправлен менеджеру на модерацию.");
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
            {hasReviews && <span aria-label={`${product.rating.toFixed(1)} из 5`} className={styles.stars}>{"★".repeat(Math.round(product.rating))}{"☆".repeat(5 - Math.round(product.rating))}</span>}
            <span>{hasReviews ? `${product.reviews} отзывов` : "Пока без отзывов"}</span>
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
              <p>Для заказов от 1 500 ₽ доставка будет бесплатной. Доступные ПВЗ, курьер, стоимость и срок появятся после подключения Ozon Доставки и СДЭК.</p>
            </details>
          </div>
        </div>
      </section>

      <section className={styles.reviews} aria-labelledby="reviews-title">
        <div className={styles.reviewSummary}>
          <p>Отзывы</p>
          <h2 id="reviews-title">{hasReviews ? product.rating.toFixed(1) : "—"}</h2>
          <div className={styles.reviewMeta}>
            {hasReviews && <span aria-label={`${product.rating.toFixed(1)} из 5`} className={styles.stars}>{"★".repeat(Math.round(product.rating))}{"☆".repeat(5 - Math.round(product.rating))}</span>}
            <span>{hasReviews ? `${product.reviews} оценок` : "Оценок пока нет"}</span>
          </div>
          <div className={styles.ratingBreakdown} aria-label="Распределение оценок">
            {ratingRows.map((rating) => (
              <div key={rating}>
                <span>{rating}</span>
                <i><b style={{ width: `${approvedReviews.length ? (approvedReviews.filter((review) => review.rating === rating).length / approvedReviews.length) * 100 : 0}%` }} /></i>
                <small>{approvedReviews.filter((review) => review.rating === rating).length}</small>
              </div>
            ))}
          </div>
        </div>
        <div className={styles.reviewState}>
          <span className={styles.reviewEyebrow}>Ваше мнение важно</span>
          {userEmail ? (
            <>
              <h3>{pendingReview ? "Ваш отзыв уже на проверке" : "Поделитесь впечатлением"}</h3>
              {!pendingReview && <form className={styles.reviewForm} onSubmit={submitReview}>
                <fieldset><legend>Оценка</legend><div>{[1, 2, 3, 4, 5].map((rating) => <button aria-label={`${rating} из 5`} aria-pressed={rating <= reviewRating} className={rating <= reviewRating ? styles.activeStar : ""} key={rating} onClick={() => setReviewRating(rating)} type="button">★</button>)}</div></fieldset>
                <label>Ваш отзыв<textarea minLength={10} onChange={(event) => setReviewText(event.target.value)} placeholder="Расскажите о текстуре, аромате и результате" required rows={4} value={reviewText} /></label>
                <label className={styles.photoInput}>До двух фото<input accept="image/*" multiple onChange={addPhotos} type="file" /></label>
                {reviewPhotos.length > 0 && <div className={styles.reviewPhotos}>{reviewPhotos.map((photo, index) => <span key={`${photo.slice(0, 30)}-${index}`}><Image alt={`Фото к отзыву ${index + 1}`} fill sizes="90px" src={photo} unoptimized /></span>)}</div>}
                <button className={styles.submitReview} type="submit">Отправить на модерацию</button>
              </form>}
              {pendingReview && <p>После одобрения менеджером текст и фотографии появятся на странице товара.</p>}
              {reviewNotice && <div className={styles.reviewNotice} role="status">{reviewNotice}</div>}
            </>
          ) : (
            <>
              <h3>{hasReviews ? "Добавьте свой отзыв" : "Будьте первым, кто поделится впечатлением"}</h3>
              <p>Войдите в личный кабинет, поставьте оценку, напишите текст и приложите фотографии.</p>
              <Link href="/account">Войти, чтобы оставить отзыв</Link>
            </>
          )}
          {approvedReviews.length > 0 && <div className={styles.reviewList}>{approvedReviews.map((review) => <article key={review.id}><header><strong>{review.email.split("@")[0]}</strong><span>{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</span></header><p>{review.text}</p>{review.photos.length > 0 && <div>{review.photos.map((photo, index) => <span key={`${review.id}-${index}`}><Image alt={`Фото покупателя ${index + 1}`} fill sizes="110px" src={photo} unoptimized /></span>)}</div>}<small>{new Intl.DateTimeFormat("ru-RU").format(new Date(review.createdAt))}</small></article>)}</div>}
          <small>Мы не публикуем рекламные тексты под видом отзывов покупателей.</small>
        </div>
      </section>

      <section className={styles.sensory} aria-labelledby="sensory-title">
        <div className={styles.sensoryCopy}>
          <p>Ощущения и результат</p>
          <h2 id="sensory-title">Комфорт на уровне ощущений</h2>
          <span>Характер продукта во время нанесения и результат, который остаётся после ежедневного ритуала.</span>
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
        </div>
        <div className={styles.sensoryVisual}>
          <Image alt={`${product.name} — настроение и текстура`} fill sizes="(max-width: 900px) 100vw, 50vw" src={gallery[2] ?? gallery[1] ?? gallery[0]} />
        </div>
      </section>

      <section className={styles.recommendations} aria-labelledby="recommendations-title">
        <div className={styles.sectionHeading}>
          <h2 id="recommendations-title">Рекомендуем</h2>
          <div className={styles.recommendationActions}>
            <Link href="/catalog">Весь каталог</Link>
            <div className={styles.sliderArrows}>
              <button aria-label="Предыдущие рекомендации" onClick={() => scrollRecommendations(-1)} type="button">←</button>
              <button aria-label="Следующие рекомендации" onClick={() => scrollRecommendations(1)} type="button">→</button>
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
          {recommendations.map((item) => <ProductCard key={item.id} product={item} />)}
        </div>
      </section>
      <aside className={styles.stickyBuy} aria-label="Быстрая покупка">
        <div><small>{product.name}</small><strong>{formatPrice(product.price)}</strong></div>
        <button className={styles.buyNow} disabled={!product.stock} onClick={buyNow} type="button">Купить сейчас</button>
        <button className={styles.stickyCart} disabled={!product.stock || quantity >= product.stock} onClick={() => addToCart(product.id)} type="button">{quantity ? `В корзине · ${quantity}` : "В корзину"}</button>
      </aside>
    </main>
  );
}
