import type { Metadata } from "next";
import Link from "next/link";
import { SiteChrome, SiteFooter } from "@/components/site-shell";
import styles from "./where-to-buy.module.css";

export const metadata: Metadata = { title: "Где купить" };

const stores = [
  { name: "ASAYA", note: "Официальный сайт", href: "/catalog", external: false },
  { name: "Ozon", note: "Официальная витрина бренда", href: "https://asaya.mobz.click/mrh3", external: true },
  { name: "Wildberries", note: "Официальная витрина бренда", href: "https://asaya.mobz.click/fp0uu", external: true },
  { name: "Золотое Яблоко", note: "Онлайн и в выбранных магазинах", href: "https://goldapple.ru/", external: true },
];

export default function WhereToBuyPage() {
  return (
    <>
      <div className={styles.page}>
        <SiteChrome />
        <main>
          <header className={styles.heading}><p>ASAYA / Покупка</p><h1>Где купить</h1><span>Выбирайте официальный сайт или подтверждённые площадки бренда.</span></header>
          <section className={styles.grid}>
            {stores.map((store, index) => (
              <article key={store.name} className={index === 0 ? styles.primary : ""}>
                <span>0{index + 1}</span><p>{store.note}</p><h2>{store.name}</h2>
                {store.external ? <a href={store.href} rel="noreferrer" target="_blank">Открыть площадку ↗</a> : <Link href={store.href}>Открыть каталог →</Link>}
              </article>
            ))}
          </section>
          <p className={styles.notice}>Перед покупкой на внешней площадке проверьте название продавца и карточку бренда. Ассортимент, цена и наличие могут отличаться.</p>
        </main>
      </div>
      <SiteFooter />
    </>
  );
}
