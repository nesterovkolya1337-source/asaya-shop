"use client";

import Image from "next/image";
import Link from "next/link";
import { useShop, type ProductAdminUpdate } from "@/components/shop-provider";
import { categoryLabels, formatPrice, type Product, type ProductCategory } from "@/lib/store-data";
import styles from "./admin.module.css";

type NumberField = "price" | "oldPrice" | "discount" | "stock";

function toNumber(value: string, field: NumberField) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  if (field === "discount") return Math.min(100, Math.max(0, Math.round(parsed)));
  return Math.max(0, Math.round(parsed));
}

function ProductRow({ product, updateProduct }: { product: Product; updateProduct: (id: string, updates: ProductAdminUpdate) => void }) {
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
        <label>Бейдж<input maxLength={24} onChange={(event) => updateProduct(product.id, { badge: event.target.value })} placeholder="Новинка" type="text" value={product.badge} /></label>
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
          <label className={styles.wideField}>Описание<textarea onChange={(event) => updateProduct(product.id, { description: event.target.value })} rows={4} value={product.description} /></label>
          <label className={styles.wideField}>Способ применения<textarea onChange={(event) => updateProduct(product.id, { usage: event.target.value })} rows={4} value={product.usage} /></label>
          <label className={styles.wideField}>Аромат<textarea onChange={(event) => updateProduct(product.id, { aroma: event.target.value })} rows={3} value={product.aroma} /></label>
          <label className={styles.wideField}>Состав<textarea onChange={(event) => updateProduct(product.id, { ingredients: event.target.value })} rows={5} value={product.ingredients} /></label>
        </div>
      </details>
    </article>
  );
}

export function ProductEditor() {
  const { products, resetProducts, updateProduct } = useShop();

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

      <div className={styles.productList}>
        {products.map((product) => <ProductRow key={product.id} product={product} updateProduct={updateProduct} />)}
      </div>
    </section>
  );
}
