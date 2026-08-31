import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { SiteChrome, SiteFooter } from "@/components/site-shell";
import { assetPath } from "@/lib/asset-path";
import styles from "./about.module.css";

export const metadata: Metadata = { title: "О бренде" };

const moods = [
  {
    number: "01",
    name: "Расслабление",
    meaning: "Мне можно выдохнуть",
    tone: "relaxation",
  },
  {
    number: "02",
    name: "Сексуальность",
    meaning: "Мне нравится чувствовать себя сексуальной",
    tone: "sensuality",
  },
  {
    number: "03",
    name: "Уверенность",
    meaning: "Я всё смогу. Я знаю себе цену",
    tone: "confidence",
  },
  {
    number: "04",
    name: "Свобода",
    meaning: "Мне можно делать по-своему",
    tone: "freedom",
  },
  {
    number: "05",
    name: "Перемены",
    meaning: "Я готова к новому",
    tone: "change",
  },
  {
    number: "06",
    name: "Индивидуальность",
    meaning: "У меня свой вкус",
    tone: "individuality",
  },
] as const;

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
              <span>ASAYA — российский бренд косметики про настроение. Каждый продукт сохраняет понятную функцию, а аромат, цвет и ритуал помогают выбрать, как хочется себя чувствовать сегодня.</span>
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

          <section className={styles.moods} aria-labelledby="moods-title">
            <header>
              <p>Эмоциональная система ASAYA</p>
              <h2 id="moods-title">Шесть состояний. Одно право — быть разной.</h2>
              <span>ASAYA развивается к системе шести эмоциональных состояний. Пока коллекции не распределены по ним, мы не приписываем нынешним ароматам и флаконам несуществующие смыслы.</span>
            </header>
            <div className={styles.moodGrid}>
              {moods.map((mood) => (
                <article className={`${styles.moodCard} ${styles[mood.tone]}`} key={mood.name}>
                  <div className={styles.moodCopy}>
                    <span>{mood.number}</span>
                    <p>{mood.name}</p>
                    <h3>{mood.meaning}</h3>
                  </div>
                </article>
              ))}
            </div>
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

          <section className={styles.formula}>
            <p>Формула продукта ASAYA</p>
            <h2>Доказуемая функция <span>+</span> приятный опыт <span>+</span> характерный аромат <span>+</span> сильная эстетика <span>+</span> эмоциональный мир.</h2>
            <div><strong>Эмоция помогает влюбиться.</strong><strong>Эстетика помогает захотеть.</strong><strong>Качество заставляет купить повторно.</strong></div>
          </section>
        </main>
      </div>
      <SiteFooter />
    </>
  );
}
