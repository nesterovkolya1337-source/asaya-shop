import Link from "next/link";
import styles from "./site-shell.module.css";

export function SiteHeader() {
  return (
    <header className={styles.header}>
      <nav aria-label="Основная навигация" className={styles.navigation}>
        <div className={styles.navigationSide}>
          <Link href="/catalog">Каталог</Link>
          <a
            href="https://www.figma.com/design/4w8Dr2nHxdoxu6uOGmAtYR/Website--Copy-?node-id=1-2"
            target="_blank"
            rel="noreferrer"
          >
            Page 2
          </a>
        </div>
        <Link className={styles.wordmark} href="/" aria-label="ASAYA — главная">
          ASAYA
        </Link>
        <div className={`${styles.navigationSide} ${styles.navigationEnd}`}>
          <Link href="/checkout">Checkout</Link>
          <span aria-label="Корзина пока пуста">Корзина (0)</span>
        </div>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <p className={styles.footerWordmark}>ASAYA</p>
        <div className={styles.footerLinks}>
          <Link href="/catalog">Каталог</Link>
          <Link href="/checkout">Оформление заказа</Link>
          <a href="mailto:hello@asaya.ru">hello@asaya.ru</a>
        </div>
        <p className={styles.footerNote}>Хорошее может быть уже сегодня.</p>
      </div>
    </footer>
  );
}
