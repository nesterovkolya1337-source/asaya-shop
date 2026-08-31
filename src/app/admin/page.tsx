import type { Metadata } from "next";
import Link from "next/link";
import { SiteChrome } from "@/components/site-shell";
import { ProductEditor } from "./product-editor";
import styles from "./admin.module.css";

export const metadata: Metadata = {
  title: "Кабинет менеджера",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  const sections = [
    ["01", "Дашборд", "Продажи, заказы, средний чек и остатки"],
    ["02", "Товары", "Цена, скидка, статус, остаток, фото и характеристики"],
    ["03", "Инструкции", "Шаги применения, количество, советы и FAQ"],
    ["04", "Заказы", "Оплата, сборка, доставка, возвраты и история"],
    ["05", "Отзывы", "Модерация, фото, подтверждение покупки и ответы"],
    ["06", "Клиенты", "Профили, заказы, обращения и согласия"],
    ["07", "Промо", "Промокоды, скидки, наборы и сроки акции"],
    ["08", "Контент", "Баннеры, подборки, UGC и страницы сайта"],
    ["09", "Аналитика", "Конверсия, источники, товары и повторные покупки"],
    ["10", "Интеграции", "Оплата, доставка, CRM и маркетплейсы"],
    ["11", "Роли", "Доступы администратора, контент- и заказ-менеджера"],
    ["12", "Журнал действий", "Кто, когда и какое поле изменил"],
  ];

  return (
    <div className={styles.page}>
      <SiteChrome />
      <main>
        <section className={styles.locked}>
          <span className={styles.lockIcon} aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg></span>
          <p>ASAYA / Кабинет менеджера</p>
          <h1>Управление магазином только через защищённый вход</h1>
          <div className={styles.explanation}>
            <strong>Сейчас показана структура будущего back-office.</strong>
            <span>GitHub Pages не умеет безопасно хранить товары и проверять роли. Реальное редактирование включим после подключения сервера, базы данных, 2FA, резервных копий и журнала действий.</span>
          </div>
          <Link href="/">Вернуться в магазин</Link>
        </section>
        <section className={styles.blueprint}>
          <header><p>Структура кабинета</p><h2>Всё, что менеджер сможет менять без разработчика</h2></header>
          <div className={styles.moduleGrid}>
            {sections.map(([number, title, text]) => <article key={number}><span>{number}</span><h3>{title}</h3><p>{text}</p></article>)}
          </div>
          <aside><strong>Принцип безопасности</strong><span>Покупатели никогда не получают доступ к этим разделам. Каждое изменение цены, скидки или карточки товара сохраняется с автором и временем.</span></aside>
        </section>
        <ProductEditor />
      </main>
    </div>
  );
}
