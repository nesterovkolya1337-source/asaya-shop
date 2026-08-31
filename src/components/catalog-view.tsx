"use client";

import { useEffect, useMemo, useState } from "react";
import { ProductCard } from "@/components/product-card";
import { useShop } from "@/components/shop-provider";
import { categoryLabels, type ProductCategory } from "@/lib/store-data";
import styles from "./catalog-view.module.css";

type Filter = "all" | ProductCategory;
type Sort = "featured" | "price-asc" | "price-desc" | "name";

const filters: { id: Filter; label: string }[] = [
  { id: "all", label: "Все продукты" },
  ...Object.entries(categoryLabels).map(([id, label]) => ({ id: id as ProductCategory, label })),
];

export function CatalogView({ initialFilter = "all" }: { initialFilter?: Filter }) {
  const { products } = useShop();
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>("featured");

  useEffect(() => {
    const category = new URLSearchParams(window.location.search).get("category");
    if (category && filters.some((item) => item.id === category)) {
      queueMicrotask(() => setFilter(category as Filter));
    }
  }, []);

  const visibleProducts = useMemo(() => products.filter((product) => {
    const matchesFilter = filter === "all" || product.category === filter;
    const matchesSearch = product.name.toLocaleLowerCase("ru").includes(search.trim().toLocaleLowerCase("ru"));
    return product.active && matchesFilter && matchesSearch;
  }).sort((first, second) => {
    if (sort === "price-asc") return first.price - second.price;
    if (sort === "price-desc") return second.price - first.price;
    if (sort === "name") return first.name.localeCompare(second.name, "ru");
    return 0;
  }), [filter, products, search, sort]);

  return (
    <main>
      <section className={styles.catalog} aria-labelledby="catalog-title">
        <div className={styles.catalogHeading}>
          <div>
            <p className={styles.eyebrow}>ASAYA / Каталог</p>
            <h1 id="catalog-title">Найди свой ритуал</h1>
          </div>
          <label className={styles.search} id="search">
            <span className={styles.srOnly}>Поиск по каталогу</span>
            <input
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Поиск"
              type="search"
              value={search}
            />
            <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/></svg>
          </label>
        </div>

        <div className={styles.controls}>
          <div className={styles.filters} aria-label="Фильтр по категориям">
            {filters.map((item) => (
              <button
                aria-pressed={filter === item.id}
                className={filter === item.id ? styles.activeFilter : ""}
                key={item.id}
                onClick={() => setFilter(item.id)}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>
          <label className={styles.sort}>Сортировка<select onChange={(event) => setSort(event.target.value as Sort)} value={sort}><option value="featured">По умолчанию</option><option value="price-asc">Сначала дешевле</option><option value="price-desc">Сначала дороже</option><option value="name">По названию</option></select></label>
        </div>

        {visibleProducts.length ? (
          <div className={styles.grid}>
            {visibleProducts.map((product) => <ProductCard key={product.id} product={product} />)}
          </div>
        ) : (
          <div className={styles.empty}>
            <p>По этому запросу ничего не найдено.</p>
            <button onClick={() => { setSearch(""); setFilter("all"); }} type="button">Показать все продукты</button>
          </div>
        )}
      </section>
    </main>
  );
}
