"use client";

import Image from "next/image";
import Link from "next/link";
import { useShop } from "@/components/shop-provider";
import styles from "./instructions.module.css";

export function InstructionsGrid() {
  const { products } = useShop();

  return (
    <section className={styles.grid} aria-label="Выберите продукт">
      {products.filter((product) => product.active).map((product) => (
        <Link href={`/instructions/${product.id}`} key={product.id}>
          <span className={styles.image}><Image alt={product.name} fill sizes="(max-width: 620px) 46vw, 380px" src={product.image} /></span>
          <small>{product.volume}</small>
          <h2>{product.name}</h2>
          <strong>Открыть инструкцию →</strong>
        </Link>
      ))}
    </section>
  );
}
