import Image from "next/image";
import Link from "next/link";
import { ProductRail } from "@/components/product-rail";
import { SiteFooter, SiteHeader } from "@/components/site-shell";
import { assetPath } from "@/lib/asset-path";
import styles from "./page.module.css";

const categories = [
  {
    name: "Волосы",
    href: "/catalog?category=hair",
    image: assetPath("/images/figma/asaya-6205.webp"),
    position: "hair",
  },
  {
    name: "Тело",
    href: "/catalog?category=body",
    image: assetPath("/images/figma/asaya-6691.webp"),
    position: "body",
  },
  {
    name: "Лицо",
    href: "/catalog?category=face",
    image: assetPath("/images/figma/asaya-6459.webp"),
    position: "face",
  },
];

const communityPhotos = [
  {
    image: assetPath("/images/figma/ugc-img5872.webp"),
    alt: "Девушки с косметикой ASAYA",
  },
  {
    image: assetPath("/images/figma/ugc-000012160039.webp"),
    alt: "Уход за волосами с ASAYA",
  },
  {
    image: assetPath("/images/figma/ugc-red-product.webp"),
    alt: "Красный флакон ASAYA",
  },
  {
    image: assetPath("/images/figma/ugc-img3456.webp"),
    alt: "Набор косметики ASAYA",
  },
];

export default function Home() {
  return (
    <>
      <div className={styles.page} data-node-id="1:6">
        <div className={styles.announcement}>
          Бесплатная доставка при заказе от 1500 ₽
        </div>

        <main>
          <section className={styles.hero}>
            <Image
              alt="Модель с розовыми волосами держит спрей ASAYA"
              className={styles.heroImage}
              fill
              priority
              sizes="(max-width: 1280px) 94vw, 1160px"
              src={assetPath("/images/figma/hero.webp")}
            />
            <SiteHeader overlay />
            <div className={styles.heroCopy}>
              <h1>Уходовая косметика для волос</h1>
              <Link className={styles.lightButton} href="/catalog?category=hair">
                Узнать больше
              </Link>
            </div>
          </section>

          <section className={styles.products} aria-labelledby="featured-title">
            <h2 id="featured-title">Бестселлеры / Новинки</h2>
            <ProductRail limit={3} />
          </section>

          <section className={styles.manifesto}>
            <Image
              alt="Модель ASAYA с кудрявыми волосами"
              className={styles.coverImage}
              fill
              sizes="(max-width: 1280px) 94vw, 1160px"
              src={assetPath("/images/figma/asaya-6139.webp")}
            />
            <p>
              Для ASAYA уход — это сочетание результата и эмоций. Мы создаём
              профессиональные продукты, которые дарят видимый эффект и превращают
              ежедневный уход в маленький ритуал любви к себе.
            </p>
          </section>

          <section className={styles.categoryGrid} aria-label="Категории каталога">
            {categories.map((category) => (
              <Link className={styles.categoryCard} href={category.href} key={category.name}>
                <Image
                  alt={category.name}
                  className={`${styles.categoryImage} ${styles[category.position]}`}
                  fill
                  sizes="(max-width: 760px) 92vw, 370px"
                  src={category.image}
                />
                <span>{category.name}</span>
              </Link>
            ))}
          </section>

          <section className={styles.careSection}>
            <div className={styles.careImageWrap}>
              <Image
                alt="Модель использует спрей ASAYA"
                className={styles.careImage}
                fill
                sizes="(max-width: 760px) 92vw, 580px"
                src={assetPath("/images/figma/asaya-6459.webp")}
              />
            </div>
            <div className={styles.careCopy}>
              <h2>Ухаживай на ходу</h2>
              <p>
                Мульти спрей для волос удобно взять с собой в спортзал. Без него
                тренировка и свежесть причёски в любое время сложнее.
              </p>
              <Link className={styles.darkButton} href="/catalog?category=hair">
                К продуктам
              </Link>
            </div>
          </section>

          <section className={styles.community} aria-labelledby="community-title">
            <h2 id="community-title">Ты + ASAYA</h2>
            <div className={styles.communityGrid}>
              {communityPhotos.map((photo) => (
                <div className={styles.communityPhoto} key={photo.image}>
                  <Image
                    alt={photo.alt}
                    className={styles.coverImage}
                    fill
                    sizes="(max-width: 760px) 44vw, 270px"
                    src={photo.image}
                  />
                </div>
              ))}
            </div>
          </section>
        </main>
      </div>
      <SiteFooter />
    </>
  );
}
