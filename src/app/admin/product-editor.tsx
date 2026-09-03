"use client";

import Image from "next/image";
import Link from "next/link";
import { useShop, type ProductAdminUpdate, type ProductReview, type ReviewStatus } from "@/components/shop-provider";
import { badgeOptions, categoryLabels, formatPrice, type Product, type ProductCategory } from "@/lib/store-data";
import styles from "./admin.module.css";

type NumberField = "price" | "oldPrice" | "discount" | "stock";

function toNumber(value: string, field: NumberField) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  if (field === "discount") return Math.min(100, Math.max(0, Math.round(parsed)));
  return Math.max(0, Math.round(parsed));
}

function ProductRow({ product, products, updateProduct }: { product: Product; products: Product[]; updateProduct: (id: string, updates: ProductAdminUpdate) => void }) {
  const updateNumber = (field: NumberField, value: string) => updateProduct(product.id, { [field]: toNumber(value, field) });

  return (
    <article className={styles.productRow}>
      <div className={styles.productIdentity}>
        <div className={styles.productThumb}><Image alt="" fill sizes="84px" src={product.image} /></div>
        <div>
          <span>{categoryLabels[product.category]} · {product.volume}</span>
          <h3>{product.name}</h3>
          <Link href={`/product/${product.id}`}>Открыть карточку ↗</Link>
        </div>
      </div>

      <div className={styles.editorFields}>
        <label>Цена, ₽<input min="0" onChange={(event) => updateNumber("price", event.target.value)} type="number" value={product.price} /></label>
        <label>Старая цена, ₽<input min="0" onChange={(event) => updateNumber("oldPrice", event.target.value)} type="number" value={product.oldPrice} /></label>
        <label>Скидка, %<input max="100" min="0" onChange={(event) => updateNumber("discount", event.target.value)} type="number" value={product.discount} /></label>
        <label>Остаток, шт.<input min="0" onChange={(event) => updateNumber("stock", event.target.value)} type="number" value={product.stock} /></label>
        <label>Бейдж<select onChange={(event) => updateProduct(product.id, { badge: event.target.value })} value={product.badge}>{badgeOptions.map((badge) => <option key={badge || "none"} value={badge}>{badge || "Без бейджа"}</option>)}</select></label>
        <label className={styles.activeToggle}>
          <input checked={product.active} onChange={(event) => updateProduct(product.id, { active: event.target.checked })} type="checkbox" />
          <span>{product.active ? "Показывается" : "Скрыт"}</span>
        </label>
      </div>

      <div className={styles.productResult}>
        <span>Сейчас в магазине</span>
        <strong>{formatPrice(product.price)}</strong>
        {product.oldPrice > product.price && <small>{formatPrice(product.oldPrice)}</small>}
      </div>

      <details className={styles.contentEditor}>
        <summary>Описание, состав и применение</summary>
        <div>
          <label>Название<input onChange={(event) => updateProduct(product.id, { name: event.target.value })} type="text" value={product.name} /></label>
          <label>Объём<input onChange={(event) => updateProduct(product.id, { volume: event.target.value })} type="text" value={product.volume} /></label>
          <label>Категория<select onChange={(event) => updateProduct(product.id, { category: event.target.value as ProductCategory })} value={product.category}>{Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className={styles.wideField}>Основное фото<input onChange={(event) => updateProduct(product.id, { image: event.target.value })} type="text" value={product.image} /></label>
          <label className={styles.wideField}>Галерея товара — одна фотография в строке<textarea onChange={(event) => updateProduct(product.id, { gallery: event.target.value.split("\n").map((value) => value.trim()).filter(Boolean) })} rows={5} value={product.gallery.join("\n")} /></label>
          <label className={styles.wideField}>Описание<textarea onChange={(event) => updateProduct(product.id, { description: event.target.value })} rows={4} value={product.description} /></label>
          <label className={styles.wideField}>Способ применения<textarea onChange={(event) => updateProduct(product.id, { usage: event.target.value })} rows={4} value={product.usage} /></label>
          {product.instruction.steps.map((step, index) => (
            <label className={styles.wideField} key={`${product.id}-step-${index}`}>Шаг {index + 1}<input onChange={(event) => updateProduct(product.id, { instruction: { ...product.instruction, steps: product.instruction.steps.map((currentStep, stepIndex) => stepIndex === index ? event.target.value : currentStep) } })} type="text" value={step} /></label>
          ))}
          <label className={styles.wideField}>Количество средства<textarea onChange={(event) => updateProduct(product.id, { instruction: { ...product.instruction, amount: event.target.value } })} rows={2} value={product.instruction.amount} /></label>
          <label className={styles.wideField}>Полезный совет<textarea onChange={(event) => updateProduct(product.id, { instruction: { ...product.instruction, tip: event.target.value } })} rows={2} value={product.instruction.tip} /></label>
          <fieldset className={`${styles.wideField} ${styles.recommendationEditor}`}>
            <legend>Рекомендуемые товары — выбираются вручную</legend>
            <div>
              {products.filter((item) => item.id !== product.id).map((item) => {
                const selected = product.recommendations.includes(item.id);
                return <label key={item.id}><input checked={selected} onChange={(event) => updateProduct(product.id, { recommendations: event.target.checked ? [...product.recommendations, item.id] : product.recommendations.filter((id) => id !== item.id) })} type="checkbox" /><span>{item.name}</span></label>;
              })}
            </div>
          </fieldset>
          <label className={styles.wideField}>Аромат<textarea onChange={(event) => updateProduct(product.id, { aroma: event.target.value })} rows={3} value={product.aroma} /></label>
          <label className={styles.wideField}>Состав<textarea onChange={(event) => updateProduct(product.id, { ingredients: event.target.value })} rows={5} value={product.ingredients} /></label>
        </div>
      </details>
    </article>
  );
}

function ReviewModeration({ moderateReview, products, reviews }: { moderateReview: (id: string, status: ReviewStatus) => void; products: Product[]; reviews: ProductReview[] }) {
  const statusLabels: Record<ReviewStatus, string> = {
    pending: "На проверке",
    approved: "Опубликован",
    rejected: "Отклонён",
  };
  const orderedReviews = [...reviews].sort((left, right) => {
    if (left.status === right.status) return right.createdAt.localeCompare(left.createdAt);
    return left.status === "pending" ? -1 : 1;
  });

  return (
    <section className={styles.reviewModeration} aria-labelledby="review-moderation-title">
      <header>
        <div><p>Отзывы покупателей</p><h3 id="review-moderation-title">Модерация текста и фотографий</h3></div>
        <span>{reviews.filter((review) => review.status === "pending").length} на проверке</span>
      </header>
      {orderedReviews.length ? (
        <div className={styles.reviewQueue}>
          {orderedReviews.map((review) => {
            const product = products.find((item) => item.id === review.productId);
            return (
              <article key={review.id}>
                <div className={styles.reviewDetails}>
                  <span>{product?.name ?? review.productId}</span>
                  <h4>{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</h4>
                  <p>{review.text}</p>
                  <small>{review.email} · {new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(review.createdAt))}</small>
                  {review.photos.length > 0 && <div className={styles.moderationPhotos}>{review.photos.map((photo, index) => <span key={`${review.id}-${index}`}><Image alt={`Фото к отзыву ${index + 1}`} fill sizes="94px" src={photo} unoptimized /></span>)}</div>}
                </div>
                <div className={styles.moderationActions}>
                  <strong data-status={review.status}>{statusLabels[review.status]}</strong>
                  <button disabled={review.status === "approved"} onClick={() => moderateReview(review.id, "approved")} type="button">Опубликовать</button>
                  <button disabled={review.status === "rejected"} onClick={() => moderateReview(review.id, "rejected")} type="button">Отклонить</button>
                </div>
              </article>
            );
          })}
        </div>
      ) : <div className={styles.emptyReviewQueue}>Новых отзывов пока нет. После отправки из карточки товара они появятся здесь.</div>}
    </section>
  );
}

export function ProductEditor() {
  const { moderateReview, products, resetProducts, reviews, updateProduct } = useShop();
  const stats = [
    ["Всего товаров", products.length],
    ["Опубликовано", products.filter((product) => product.active).length],
    ["Единиц на складе", products.reduce((sum, product) => sum + product.stock, 0)],
    ["Со скидкой", products.filter((product) => product.discount > 0).length],
  ];

  return (
    <section className={styles.editor} aria-labelledby="product-editor-title">
      <header>
        <div>
          <p>Рабочий прототип</p>
          <h2 id="product-editor-title">Цены и параметры товаров уже можно менять</h2>
        </div>
        <button onClick={resetProducts} type="button">Вернуть исходные значения</button>
      </header>

      <div className={styles.localNotice}>
        <strong>Изменения применяются сразу.</strong>
        <span>Они сохраняются только в этом браузере и видны в каталоге, корзине и карточках товаров. Общую базу и защищённый вход подключим на серверном этапе.</span>
      </div>

      <div className={styles.editorStats} aria-label="Сводка каталога">
        {stats.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
      </div>

      <ReviewModeration moderateReview={moderateReview} products={products} reviews={reviews} />

      <div className={styles.productList}>
        {products.map((product) => <ProductRow key={product.id} product={product} products={products} updateProduct={updateProduct} />)}
      </div>
    </section>
  );
}
