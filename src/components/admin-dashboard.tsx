"use client";

import Image from "next/image";
import Link from "next/link";
import { useShop } from "@/components/shop-provider";
import { categoryLabels, formatPrice, type Product, type ProductCategory } from "@/lib/store-data";
import styles from "./admin-dashboard.module.css";

function numberValue(value: string) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function NumberField({
  label,
  max,
  onCommit,
  value,
}: {
  label: string;
  max?: number;
  onCommit: (value: number) => void;
  value: number;
}) {
  return (
    <label>
      <span>{label}</span>
      <input
        defaultValue={value}
        key={value}
        max={max}
        min="0"
        onBlur={(event) => onCommit(max ? Math.min(max, numberValue(event.target.value)) : numberValue(event.target.value))}
        type="number"
      />
    </label>
  );
}

export function AdminDashboard() {
  const { moveProduct, products, resetProducts, updateProduct } = useShop();
  const activeProducts = products.filter((product) => product.active);
  const stock = products.reduce((sum, product) => sum + product.stock, 0);

  function change(id: string, updates: Partial<Product>) {
    updateProduct(id, updates);
  }

  return (
    <main className={styles.main}>
      <header className={styles.heading}>
        <div>
          <p>ASAYA / Управление</p>
          <h1>Товары и цены</h1>
          <span>Изменения сохраняются автоматически и сразу видны в витрине этого браузера.</span>
        </div>
        <div className={styles.headingActions}>
          <Link href="/catalog">Открыть витрину</Link>
          <button onClick={resetProducts} type="button">Сбросить демо-данные</button>
        </div>
      </header>

      <aside className={styles.demoNotice}>
        <strong>Демо-режим</strong>
        <span>Для настоящего закрытого кабинета и общих данных на всех устройствах подключим авторизацию и серверную базу.</span>
      </aside>

      <section className={styles.stats} aria-label="Сводка по товарам">
        <div><span>Позиций</span><strong>{products.length}</strong></div>
        <div><span>На витрине</span><strong>{activeProducts.length}</strong></div>
        <div><span>Остаток</span><strong>{stock}</strong></div>
        <div><span>Средняя цена</span><strong>{formatPrice(Math.round(activeProducts.reduce((sum, product) => sum + product.price, 0) / Math.max(1, activeProducts.length)))}</strong></div>
      </section>

      <section className={styles.products} aria-labelledby="products-heading">
        <div className={styles.sectionHeading}>
          <h2 id="products-heading">Позиции каталога</h2>
          <span>Цена, скидка, остаток, категория, подписи и порядок</span>
        </div>
        <div className={styles.productList}>
          {products.map((product, index) => (
            <article className={styles.productEditor} key={product.id}>
              <div className={styles.preview}>
                <Image alt={product.name} fill sizes="140px" src={product.image} />
              </div>
              <div className={styles.editorBody}>
                <div className={styles.editorTopline}>
                  <label className={styles.nameField}>
                    <span>Название</span>
                    <input onChange={(event) => change(product.id, { name: event.target.value })} value={product.name} />
                  </label>
                  <label className={styles.switchLabel}>
                    <input checked={product.active} onChange={(event) => change(product.id, { active: event.target.checked })} type="checkbox" />
                    <span>На витрине</span>
                  </label>
                </div>
                <div className={styles.fieldGrid}>
                  <NumberField label="Цена, ₽" onCommit={(value) => change(product.id, { price: value })} value={product.price} />
                  <NumberField label="Старая цена, ₽" onCommit={(value) => change(product.id, { oldPrice: value })} value={product.oldPrice} />
                  <NumberField label="Скидка, %" max={100} onCommit={(value) => change(product.id, { discount: value })} value={product.discount} />
                  <NumberField label="Остаток" onCommit={(value) => change(product.id, { stock: value })} value={product.stock} />
                  <label><span>Категория</span><select onChange={(event) => change(product.id, { category: event.target.value as ProductCategory })} value={product.category}>{Object.entries(categoryLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
                  <label><span>Значок</span><input onChange={(event) => change(product.id, { badge: event.target.value })} placeholder="Новинка" value={product.badge} /></label>
                </div>
                <label className={styles.description}><span>Описание</span><textarea onChange={(event) => change(product.id, { description: event.target.value })} rows={2} value={product.description} /></label>
                <div className={styles.orderButtons}>
                  <span>Позиция: {index + 1}</span>
                  <button disabled={index === 0} onClick={() => moveProduct(product.id, -1)} type="button">↑ Выше</button>
                  <button disabled={index === products.length - 1} onClick={() => moveProduct(product.id, 1)} type="button">↓ Ниже</button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
