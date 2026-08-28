import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/site-shell";
import styles from "./catalog.module.css";

export const metadata: Metadata = {
  title: "Каталог",
};

const categories = [
  { name: "Волосы", slug: "hair", color: "pink" },
  { name: "Тело", slug: "body", color: "sand" },
  { name: "Лицо", slug: "face", color: "green" },
  { name: "Наборы", slug: "sets", color: "yellow" },
];

export default function CatalogPage() {
  return (
    <>
      <div className={styles.page}>
        <SiteHeader />
        <main>
          <header className={styles.heading}>
            <p>Figma / All shop</p>
            <h1>Каталог</h1>
            <p className={styles.lead}>
              Маршрут готов к переносу карточек и фильтров из узла 140:1442.
            </p>
          </header>
          <section className={styles.grid} aria-label="Категории каталога">
            {categories.map((category) => (
              <Link
                className={styles.card}
                data-color={category.color}
                href={`/catalog?category=${category.slug}`}
                key={category.slug}
              >
                <span>ASAYA</span>
                <h2>{category.name}</h2>
              </Link>
            ))}
          </section>
        </main>
      </div>
      <SiteFooter />
    </>
  );
}
