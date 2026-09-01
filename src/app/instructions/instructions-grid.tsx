"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useShop } from "@/components/shop-provider";
import { categoryLabels, type ProductCategory } from "@/lib/store-data";
import styles from "./instructions.module.css";

type Filter = "all" | Exclude<ProductCategory, "sets">;

export function InstructionsGrid() {
  const { products } = useShop();
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const filters: Array<{ id: Filter; label: string }> = [
    { id: "all", label: "Все" }, { id: "hair", label: "Волосы" },
    { id: "body", label: "Тело" }, { id: "face", label: "Лицо" },
  ];
  const visibleProducts = useMemo(() => products.filter((product) => {
    const matchesCategory = filter === "all" || product.category === filter;
    const query = search.trim().toLocaleLowerCase("ru");
    return product.active && matchesCategory && (!query || product.name.toLocaleLowerCase("ru").includes(query));
  }), [filter, products, search]);

  return (
    <section aria-label="Выберите продукт">
      <div className={styles.controls}>
        <div className={styles.filters}>{filters.map((item) => <button aria-pressed={filter === item.id} key={item.id} onClick={() => setFilter(item.id)} type="button">{item.label}</button>)}</div>
        <label><span>Найти инструкцию</span><input onChange={(event) => setSearch(event.target.value)} placeholder="Название продукта" type="search" value={search} /></label>
      </div>
      <div className={styles.grid}>
        {visibleProducts.map((product) => (
          <Link href={`/instructions/${product.id}`} key={product.id}>
            <span className={styles.image}><Image alt={product.name} fill sizes="(max-width: 620px) 110px, 160px" src={product.image} /></span>
            <span className={styles.cardCopy}>
              <small>{categoryLabels[product.category]} · {product.volume} · {product.instruction.steps.length} шага</small>
              <h2>{product.name}</h2>
              <p>{product.instruction.steps[0]}</p>
              <strong>Показать все шаги →</strong>
            </span>
          </Link>
        ))}
      </div>
      {!visibleProducts.length && <p className={styles.empty}>Инструкция не найдена. Попробуйте другое название.</p>}
    </section>
  );
}
