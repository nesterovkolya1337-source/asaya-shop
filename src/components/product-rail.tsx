"use client";

import { ProductCard } from "@/components/product-card";
import { useShop } from "@/components/shop-provider";
import styles from "./product-rail.module.css";

export function ProductRail({ limit }: { limit?: number }) {
  const { products } = useShop();
  const visibleProducts = products.filter((product) => product.active).slice(0, limit);

  return (
    <div className={styles.rail}>
      {visibleProducts.map((product) => <ProductCard key={product.id} product={product} />)}
    </div>
  );
}
