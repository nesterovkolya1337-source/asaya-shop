import type { Metadata } from "next";
import Link from "next/link";
import { SiteChrome, SiteFooter } from "@/components/site-shell";
import styles from "./faq.module.css";

export const metadata: Metadata = { title: "Вопросы и ответы" };

const questions = [
  ["Как подобрать продукт?", "Начните с задачи: очищение, увлажнение тела или защита волос. На карточке каждого продукта указаны эффект, способ применения и полный состав."],
  ["Где посмотреть подробную инструкцию?", "В разделе «Инструкции» и по ссылке на каждой карточке товара. Там указаны шаги, количество средства и полезные приёмы."],
  ["Можно ли оставить отзыв?", "Да, после подключения защищённого входа и подтверждения покупки. Отзывы будут проходить модерацию, а фотографии покупателей будут отделены от редакционного UGC."],
  ["Где проверить статус заказа?", "В личном кабинете. До подключения платёжной и логистической систем демонстрационная версия не создаёт настоящий заказ."],
  ["Что делать, если товар протёк или повредился?", "Сохраните коробку и этикетку, сделайте фотографии и напишите в службу заботы с номером заказа."],
  ["Где купить оригинальную продукцию?", "На этом сайте и на подтверждённых страницах ASAYA в Ozon, Wildberries и Золотом Яблоке."],
];

export default function FaqPage() {
  return (
    <>
      <div className={styles.page}>
        <SiteChrome />
        <main>
          <header className={styles.heading}><p>ASAYA / Помощь</p><h1>Вопросы и ответы</h1><span>Коротко о выборе, применении, заказах и поддержке.</span></header>
          <section className={styles.questions}>
            {questions.map(([question, answer]) => <details key={question}><summary>{question}<span>+</span></summary><p>{answer}</p></details>)}
          </section>
          <div className={styles.contact}><span>Не нашли ответ?</span><Link href="/support">Перейти в службу заботы</Link></div>
        </main>
      </div>
      <SiteFooter />
    </>
  );
}
