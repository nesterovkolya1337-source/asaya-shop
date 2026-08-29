import type { Metadata } from "next";
import Link from "next/link";
import { SiteChrome } from "@/components/site-shell";
import styles from "./admin.module.css";

export const metadata: Metadata = {
  title: "Закрытая зона",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return (
    <div className={styles.page}>
      <SiteChrome />
      <main className={styles.locked}>
        <span className={styles.lockIcon} aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg></span>
        <p>ASAYA / Закрытая зона</p>
        <h1>Управление магазином недоступно без защищённого входа</h1>
        <div className={styles.explanation}>
          <strong>Так и должно быть.</strong>
          <span>На статической версии GitHub Pages нельзя безопасно проверять роли администратора. Редактирование товаров будет открыто только после подключения сервера, базы данных, 2FA и журнала действий.</span>
        </div>
        <Link href="/">Вернуться в магазин</Link>
      </main>
    </div>
  );
}
