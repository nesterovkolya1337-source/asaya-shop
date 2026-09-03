import Image from "next/image";
import Link from "next/link";
import { ProductRail } from "@/components/product-rail";
import { SiteChrome, SiteFooter } from "@/components/site-shell";
import { assetPath } from "@/lib/asset-path";
import styles from "./page.module.css";

const categories = [
  {
    name: "Волосы",
    href: "/catalog/hair",
    image: assetPath("/images/figma/asaya-6205.webp"),
    position: "hair",
  },
  {
    name: "Тело",
    href: "/catalog/body",
    image: assetPath("/images/figma/asaya-6691.webp"),
    position: "body",
  },
  {
    name: "Лицо",
    href: "/catalog/face",
    image: assetPath("/images/figma/asaya-6629.webp"),
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
        <SiteChrome overlay />

        <main>
          <section className={styles.hero} data-site-hero>
            <Image
              alt="Модель с розовыми волосами держит спрей ASAYA"
              className={styles.heroImage}
              fill
              priority
              sizes="(max-width: 1280px) 94vw, 1160px"
              src={assetPath("/images/figma/hero.webp")}
            />
            <div className={styles.heroCopy}>
              <p>ASAYA — косметика под настроение</p>
              <h1>Выбери своё настроение</h1>
              <Link className={styles.lightButton} href="/catalog">
                Выбрать уход
              </Link>
            </div>
          </section>

          <section className={styles.products} aria-labelledby="featured-title">
            <h2 className={styles.srTitle} id="featured-title">Бестселлеры и новинки</h2>
            <ProductRail />
          </section>

          <section className={styles.manifesto}>
            <Image
              alt="Модель ASAYA с кудрявыми волосами"
              className={styles.coverImage}
              fill
              sizes="(max-width: 1280px) 94vw, 1160px"
              src={assetPath("/images/figma/asaya-6139.webp")}
            />
            <p>Не подстраивайся под уход. Выбирай уход под себя.</p>
            <Link className={styles.aboutButton} href="/about">Узнать об ASAYA</Link>
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
                src={assetPath("/images/figma/asaya-7082.webp")}
              />
            </div>
            <div className={styles.careCopy}>
              <h2>Увлажняй на ходу</h2>
              <p>
                Мульти спрей для волос удобно взять с собой в сумочку. Его легко
                нанести и освежить причёску в любое время.
              </p>
              <Link className={styles.darkButton} href="/catalog/hair">
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
