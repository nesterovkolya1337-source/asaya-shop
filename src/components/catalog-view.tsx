"use client";

import {placedProducts} from '@/lib/product-placement';
import Image from "next/image";
import Link from "next/link";
import { Fragment, useEffect, useMemo, useState, useRef } from "react";
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

// Original Figma crops, relative to a 1160 × 595 frame. Keep the image and
// frame proportions together instead of re-cropping every photo with cover.
const presentations: Record<Filter, { title: string; image: string; crop: { width: string; height: string; left: string; top: string } }> = {
  all: {
    title: "Уходовая косметика\nASAYA",
    image: assetPath("/images/figma/catalog-heroes/all.webp"),
    crop: { width: "123.32%", height: "360.17%", left: "-15.9%", top: "-117.22%" },
  },
  hair: {
    title: "Уходовая косметика\nдля волос",
    image: assetPath("/images/figma/catalog-heroes/hair.webp"),
    crop: { width: "171.8%", height: "418.69%", left: "-19.07%", top: "-67.18%" },
  },
  body: {
    title: "Уходовая косметика\nдля тела",
    image: assetPath("/images/figma/catalog-heroes/body.webp"),
    crop: { width: "156.27%", height: "444.14%", left: "-17.98%", top: "-124.41%" },
  },
  face: {
    title: "Уходовая косметика\nдля лица",
    image: assetPath("/images/figma/catalog-heroes/face.webp"),
    crop: { width: "104.27%", height: "253.68%", left: "-2.14%", top: "-49.49%" },
  },
  sets: {
    title: "Наборы уходовой\nкосметики",
    image: assetPath("/images/figma/catalog-heroes/sets.webp"),
    crop: { width: "122.67%", height: "299.17%", left: "-11.33%", top: "-194.05%" },
  },
};

export function CatalogView({ initialFilter = "all" }: { initialFilter?: Filter }) {
  const { products, catalogOnly, catalogStatus } = useShop();
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [search, setSearch] = useState("");
  const sortMenu=useRef<HTMLDetailsElement>(null);
  const [filtersOpen,setFiltersOpen]=useState(true);
  const [sort, setSort] = useState<Sort>("featured");

  useEffect(() => {
    const category = new URLSearchParams(window.location.search).get("category");
    if (category && filters.some((item) => item.id === category)) {
      queueMicrotask(() => setFilter(category as Filter));
    }
  }, []);

  const visibleProducts = useMemo(() => placedProducts(products,'catalog',filter!=='all').filter((product) => {
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
        <div className={styles.heroFrame}>
        <Image
          alt=""
          className={styles.heroImage}
          fill
          priority
          sizes="(max-width: 620px) 1440px, 200vw"
          src={presentation.image}
          style={presentation.crop}
        />
        </div>
        <div className={styles.heroShade} />
        <h1 id="catalog-title">{presentation.title}</h1>
      </section>

      <section className={styles.catalog} aria-labelledby="catalog-title">
        <div className={styles.controls}>
          <div className={styles.filters} aria-label="Фильтр по категориям" id="catalog-filters" hidden={!filtersOpen}>
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
            <div className={styles.sortControls}>
              <button className={styles.filterControl} type="button" aria-expanded={filtersOpen} aria-controls="catalog-filters" onClick={()=>setFiltersOpen(v=>!v)}>Фильтры <span aria-hidden="true">☷</span></button>
              <details className={styles.sort} ref={sortMenu} onKeyDown={e=>{if(e.key==='Escape'){e.currentTarget.open=false;e.currentTarget.querySelector('summary')?.focus();}}} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))e.currentTarget.open=false;}}>
                <summary aria-label="Сортировка">{{featured:'По умолчанию','price-asc':'Сначала дешевле','price-desc':'Сначала дороже',name:'По названию'}[sort]}<span aria-hidden="true">⌄</span></summary>
                <div className={styles.sortOptions}>{([['featured','По умолчанию'],['price-asc','Сначала дешевле'],['price-desc','Сначала дороже'],['name','По названию']] as const).map(([value,label])=><button key={value} type="button" aria-pressed={sort===value} onClick={()=>{setSort(value);if(sortMenu.current){sortMenu.current.open=false;sortMenu.current.querySelector('summary')?.focus();}}}>{label}</button>)}</div>
              </details>
            </div>
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
            <p>{catalogOnly && !products.length ? (catalogStatus === 'loading' ? 'Загружаем товары…' : catalogStatus === 'error' ? 'Каталог временно недоступен.' : 'Пока нет товаров, доступных для продажи.') : 'По этому запросу ничего не найдено.'}</p>
            {products.length > 0 && <button onClick={() => { setSearch(""); setFilter("all"); }} type="button">Показать все продукты</button>}
          </div>
        )}
      </section>
    </main>
  );
}
