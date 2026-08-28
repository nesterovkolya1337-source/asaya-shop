import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/site-shell";
import styles from "./page.module.css";

const products = [
  { name: "Мульти спрей для волос", price: "500 ₽", accent: "pink" },
  { name: "Увлажняющий крем для тела", price: "500 ₽", accent: "cream" },
  { name: "Гель для душа", price: "500 ₽", accent: "yellow" },
];

export default function Home() {
  return (
    <>
      <div className={styles.page}>
        <div className={styles.announcement}>
          Бесплатная доставка при заказе от 1500 ₽
        </div>
        <SiteHeader />

        <main>
          <section className={styles.hero}>
            <div className={styles.heroCopy}>
              <p className={styles.eyebrow}>ASAYA / хороший день начинается сейчас</p>
              <h1>Уходовая косметика для волос и тела</h1>
              <p className={styles.heroText}>
                Стартовая версия проекта подготовлена по структуре Figma Page 2.
                Дальше этот экран будет последовательно доведён до точного макета.
              </p>
              <div className={styles.actions}>
                <Link className={styles.primaryAction} href="/catalog">
                  Смотреть каталог
                </Link>
                <a
                  className={styles.secondaryAction}
                  href="https://www.figma.com/design/4w8Dr2nHxdoxu6uOGmAtYR/Website--Copy-?node-id=1-6"
                  target="_blank"
                  rel="noreferrer"
                >
                  Открыть Frame 6 в Figma
                </a>
              </div>
            </div>
            <div className={styles.heroVisual} aria-hidden="true">
              <span>ASAYA</span>
            </div>
          </section>

          <section className={styles.products} aria-labelledby="featured-title">
            <div className={styles.sectionHeading}>
              <p>Page 2 / первая очередь верстки</p>
              <h2 id="featured-title">Бестселлеры / Новинки</h2>
            </div>
            <div className={styles.productGrid}>
              {products.map((product) => (
                <article className={styles.productCard} key={product.name}>
                  <div className={styles.productVisual} data-accent={product.accent}>
                    <span>ASAYA</span>
                  </div>
                  <div className={styles.productMeta}>
                    <h3>{product.name}</h3>
                    <p>{product.price}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className={styles.projectStatus}>
            <div>
              <p className={styles.eyebrow}>Техническая основа</p>
              <h2>Главная, каталог и checkout готовы как маршруты</h2>
            </div>
            <Link className={styles.secondaryAction} href="/checkout">
              Открыть checkout
            </Link>
          </section>
        </main>
      </div>
      <SiteFooter />
    </>
  );
}
