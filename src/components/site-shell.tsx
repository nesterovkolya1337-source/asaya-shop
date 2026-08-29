import Image from "next/image";
import Link from "next/link";
import { assetPath } from "@/lib/asset-path";
import styles from "./site-shell.module.css";

export function SiteHeader({ overlay = false }: { overlay?: boolean }) {
  return (
    <header className={`${styles.header} ${overlay ? styles.overlay : ""}`}>
      <nav aria-label="Основная навигация" className={styles.navigation}>
        <div className={styles.navigationSide}>
          <Link href="/catalog">Каталог</Link>
          <Link href="/#about">О нас</Link>
        </div>
        <Link className={styles.wordmark} href="/" aria-label="ASAYA — главная">
          {overlay ? (
            <Image alt="ASAYA" height={26} priority src={assetPath("/images/figma/header-logo.svg")} width={114} />
          ) : (
            "ASAYA"
          )}
        </Link>
        <div className={`${styles.navigationSide} ${styles.navigationEnd}`}>
          {overlay ? (
            <Image
              alt="Аккаунт, избранное, корзина и поиск"
              height={22}
              priority
              src={assetPath("/images/figma/header-actions.svg")}
              width={155}
            />
          ) : (
            <>
              <Link href="/checkout">Checkout</Link>
              <span aria-label="Корзина пока пуста">Корзина (0)</span>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className={styles.footer} id="about">
      <div className={styles.footerInner}>
        <div className={styles.footerWordmark}>
          <Image alt="ASAYA" fill sizes="(max-width: 1200px) 86vw, 1040px" src={assetPath("/images/figma/footer-wordmark.svg")} />
        </div>
        <div className={styles.footerColumns}>
          <div>
            <p className={styles.footerLead}>
              Присоединяйтесь к нам на пути к естественному сиянию
            </p>
            <form className={styles.subscribe}>
              <label>
                <span className={styles.srOnly}>Email</span>
                <input aria-label="Email" placeholder="Email" type="email" />
              </label>
              <button type="button">Подписаться</button>
            </form>
          </div>
          <div className={styles.footerLinks}>
            <Link href="/">О нас</Link>
            <Link href="/catalog">Каталог</Link>
            <Link href="/checkout">Доставка и оплата</Link>
            <a href="mailto:hello@asaya.ru">hello@asaya.ru</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
