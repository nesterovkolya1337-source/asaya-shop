"use client";

import Link from "next/link";
import { useState } from "react";
import { ProductCard } from "@/components/product-card";
import { useShop } from "@/components/shop-provider";
import styles from "./product-rail.module.css";

type FeaturedState = "Бестселлер" | "Новинка";

export function ProductRail() {
  const { products } = useShop();
  const [state, setState] = useState<FeaturedState>("Бестселлер");
  const visibleProducts = products.filter((product) => product.active && product.badge === state);

  return (
    <>
      <div className={styles.heading}>
        <div className={styles.tabs} aria-label="Подборка товаров">
          {(["Бестселлер", "Новинка"] as FeaturedState[]).map((item) => <button aria-pressed={state === item} className={state === item ? styles.active : ""} key={item} onClick={() => setState(item)} type="button">{item === "Бестселлер" ? "Бестселлеры" : "Новинки"}</button>)}
        </div>
        <Link href="/catalog">Весь каталог →</Link>
      </div>
      <div className={styles.rail}>
        {visibleProducts.map((product) => <ProductCard key={product.id} product={product} />)}
      </div>
    </>
  );
}
