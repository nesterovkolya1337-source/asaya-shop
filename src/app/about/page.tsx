import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { SiteChrome, SiteFooter } from "@/components/site-shell";
import { assetPath } from "@/lib/asset-path";
import styles from "./about.module.css";

export const metadata: Metadata = { title: "О бренде" };

export default function AboutPage() {
  return (
    <>
      <div className={styles.page}>
        <SiteChrome />
        <main>
          <section className={styles.hero}>
            <div className={styles.heroCopy}>
              <p>ASAYA / О бренде</p>
              <h1>Выбери своё настроение</h1>
              <span>Косметика для настоящего момента: работающие формулы, приятные текстуры и аромат, к которому хочется возвращаться.</span>
              <Link href="/catalog">Выбрать уход</Link>
            </div>
            <div className={styles.heroVisual}>
              <Image alt="Девушка с продуктами ASAYA" fill priority sizes="(max-width: 760px) 94vw, 48vw" src={assetPath("/images/figma/asaya-6139.webp")} />
            </div>
          </section>

          <section className={styles.statement}>
            <p>Жизнь уже происходит сейчас</p>
            <h2>Уход — не подготовка к какому-то идеальному дню. Это способ почувствовать себя здесь и сейчас.</h2>
          </section>

          <section className={styles.story}>
            <article>
              <span>01</span>
              <h2>Эмоция и результат</h2>
              <p>Продукт должен выполнять свою задачу: бережно очищать, увлажнять, питать или защищать. А текстура, аромат и упаковка превращают этот результат в личный ритуал.</p>
            </article>
            <div className={styles.storyImage}>
              <Image alt="Ритуал ухода ASAYA" fill sizes="(max-width: 760px) 94vw, 50vw" src={assetPath("/images/figma/asaya-6205.webp")} />
            </div>
            <article className={styles.pink}>
              <span>02</span>
              <h2>Можно быть разной</h2>
              <p>Спокойной, яркой, собранной или свободной. ASAYA не предлагает исправлять себя — мы создаём уход, который поддерживает ваше состояние.</p>
            </article>
            <article>
              <span>03</span>
              <h2>Честный российский бренд</h2>
              <p>Без выдуманной иностранной легенды и громких обещаний. Мы говорим понятно, современно и только о том, что действительно есть в продукте.</p>
            </article>
          </section>
        </main>
      </div>
      <SiteFooter />
    </>
  );
}
