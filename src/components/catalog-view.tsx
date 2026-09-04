"use client";

import Image from "next/image";
import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import { ProductCard } from "@/components/product-card";
import { useShop } from "@/components/shop-provider";
import { assetPath } from "@/lib/asset-path";
import { categoryLabels, type ProductCategory } from "@/lib/store-data";
import styles from "./catalog-view.module.css";

type Filter = "all" | ProductCategory;
type Sort = "featured" | "price-asc" | "price-desc" | "name";

const filters: { id: Filter; label: string }[] = [
  { id: "all", label: "Все продукты" },
  ...Object.entries(categoryLabels).map(([id, label]) => ({ id: id as ProductCategory, label })),
];

const presentations: Record<Filter, { title: string; image: string; position: string }> = {
  all: {
    title: "Уходовая косметика\nASAYA",
    image: assetPath("/images/figma/catalog-heroes/all.webp"),
    position: "50% 38%",
  },
  hair: {
    title: "Уходовая косметика\nдля волос",
    image: assetPath("/images/figma/catalog-heroes/hair.webp"),
    position: "50% 43%",
  },
  body: {
    title: "Уходовая косметика\nдля тела",
    image: assetPath("/images/figma/catalog-heroes/body.webp"),
    position: "50% 48%",
  },
  face: {
    title: "Уходовая косметика\nдля лица",
    image: assetPath("/images/figma/catalog-heroes/face.webp"),
    position: "50% 37%",
  },
  sets: {
    title: "Наборы уходовой\nкосметики",
    image: assetPath("/images/figma/catalog-heroes/sets.webp"),
    position: "50% 43%",
  },
};

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
    const matchesFilter = filter === "all" ? product.category !== "sets" : product.category === filter;
    const matchesSearch = product.name.toLocaleLowerCase("ru").includes(search.trim().toLocaleLowerCase("ru"));
    return product.active && matchesFilter && matchesSearch;
  }).sort((first, second) => {
    if (sort === "price-asc") return first.price - second.price;
    if (sort === "price-desc") return second.price - first.price;
    if (sort === "name") return first.name.localeCompare(second.name, "ru");
    return 0;
  }), [filter, products, search, sort]);

  const presentation = presentations[filter];
  const showEditorial = !search.trim() && sort === "featured" && (filter === "all" || filter === "hair");

  return (
    <main>
      <section className={styles.hero} aria-labelledby="catalog-title">
        <Image
          alt=""
          className={styles.heroImage}
          fill
          priority
          sizes="(max-width: 1280px) 100vw, 1200px"
          src={presentation.image}
          style={{ objectPosition: presentation.position }}
        />
        <div className={styles.heroShade} />
        <h1 id="catalog-title">{presentation.title}</h1>
      </section>

      <section className={styles.catalog} aria-labelledby="catalog-title">
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
          <div className={styles.utilityControls}>
            <label className={styles.search} id="search">
              <span className={styles.srOnly}>Поиск по каталогу</span>
              <input
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Поиск по каталогу"
                type="search"
                value={search}
              />
              <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/></svg>
            </label>
            <label className={styles.sort}><span className={styles.srOnly}>Сортировка</span><select onChange={(event) => setSort(event.target.value as Sort)} value={sort}><option value="featured">По умолчанию</option><option value="price-asc">Сначала дешевле</option><option value="price-desc">Сначала дороже</option><option value="name">По названию</option></select></label>
          </div>
        </div>

        {visibleProducts.length ? (
          <div className={styles.grid}>
            {visibleProducts.map((product, index) => (
              <Fragment key={product.id}>
                <ProductCard product={product} />
                {showEditorial && index === 2 && (
                  <article className={styles.editorialCard}>
                    <Image
                      alt="Модель ASAYA с сияющей кожей"
                      className={styles.editorialImage}
                      fill
                      sizes="(max-width: 620px) 46vw, 370px"
                      src={assetPath("/images/figma/catalog-heroes/editorial.webp")}
                    />
                    <div className={styles.editorialCopy}>
                      <h2>Ваш ежедневный<br />момент заботы</h2>
                      <Link href="/catalog/face">Кремы для лица</Link>
                    </div>
                  </article>
                )}
              </Fragment>
            ))}
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
