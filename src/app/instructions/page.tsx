import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { SiteChrome, SiteFooter } from "@/components/site-shell";
import { defaultProducts } from "@/lib/store-data";
import styles from "./instructions.module.css";

export const metadata: Metadata = { title: "Инструкции по применению" };

export default function InstructionsPage() {
  return (
    <>
      <div className={styles.page}>
        <SiteChrome />
        <main>
          <header className={styles.heading}>
            <p>ASAYA / Инструкции</p>
            <h1>Как пользоваться продуктами</h1>
            <span>Короткие и понятные шаги, чтобы средство работало так, как задумано.</span>
          </header>
          <section className={styles.grid} aria-label="Выберите продукт">
            {defaultProducts.filter((product) => product.active).map((product) => (
              <Link href={`/instructions/${product.id}`} key={product.id}>
                <span className={styles.image}><Image alt={product.name} fill sizes="(max-width: 620px) 46vw, 380px" src={product.image} /></span>
                <small>{product.volume}</small>
                <h2>{product.name}</h2>
                <strong>Открыть инструкцию →</strong>
              </Link>
            ))}
          </section>
        </main>
      </div>
      <SiteFooter />
    </>
  );
}
