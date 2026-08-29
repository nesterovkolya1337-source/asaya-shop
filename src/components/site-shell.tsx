"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useShop } from "@/components/shop-provider";
import { assetPath } from "@/lib/asset-path";
import styles from "./site-shell.module.css";

export function SiteHeader({ overlay = false }: { overlay?: boolean }) {
  const { cartCount, favorites } = useShop();

  return (
    <header className={`${styles.header} ${overlay ? styles.overlay : ""}`}>
      <nav aria-label="Основная навигация" className={styles.navigation}>
        <div className={styles.navigationSide}>
          <Link href="/catalog">Каталог</Link>
          <Link href="/about">О бренде</Link>
        </div>
        <details className={styles.mobileMenu}>
          <summary aria-label="Открыть меню" role="button">
            <span />
            <span />
            <span />
          </summary>
          <div className={styles.mobileMenuPanel}>
            <Link href="/catalog">Каталог</Link>
            <Link href="/about">О бренде</Link>
            <Link href="/delivery">Доставка и оплата</Link>
            <Link href="/stores">Где нас найти</Link>
            <Link href="/support">Служба заботы</Link>
            <Link href="/order-status">Статус заказа</Link>
          </div>
        </details>
        <Link className={styles.wordmark} href="/" aria-label="ASAYA — главная">
          {overlay ? (
            <>
              <Image className={styles.desktopLogo} alt="ASAYA" height={26} priority src={assetPath("/images/figma/header-logo.svg")} width={114} />
              <span className={styles.mobileWordmark}>ASAYA</span>
            </>
          ) : (
            "ASAYA"
          )}
        </Link>
        <div className={`${styles.navigationSide} ${styles.navigationEnd}`}>
          <Link className={`${styles.iconLink} ${styles.mobileOptional}`} href="/catalog#search" aria-label="Поиск">
            <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/></svg>
          </Link>
          <Link className={`${styles.iconLink} ${styles.mobileOptional}`} href="/account#favorites" aria-label={`Избранное: ${favorites.length}`}>
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M20.8 4.6a5.4 5.4 0 0 0-7.6 0L12 5.8l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6l1.2 1.2L12 21l7.6-7.6 1.2-1.2a5.4 5.4 0 0 0 0-7.6Z"/></svg>
            {favorites.length > 0 && <span className={styles.counter}>{favorites.length}</span>}
          </Link>
          <Link className={styles.iconLink} href="/account" aria-label="Личный кабинет">
            <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>
          </Link>
          <Link className={styles.iconLink} href="/checkout" aria-label={`Корзина: ${cartCount}`}>
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 8h14l-1 13H6L5 8Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/></svg>
            {cartCount > 0 && <span className={styles.counter}>{cartCount}</span>}
          </Link>
        </div>
      </nav>
    </header>
  );
}

export function SiteChrome({ overlay = false }: { overlay?: boolean }) {
  return (
    <div className={`${styles.chrome} ${overlay ? styles.chromeOverlay : ""}`}>
      <div className={styles.promo}>Бесплатная доставка при заказе от 1500 ₽</div>
      <SiteHeader overlay={overlay} />
    </div>
  );
}

export function SiteFooter() {
  const [subscribed, setSubscribed] = useState(false);

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
            <form className={styles.subscribe} onSubmit={(event) => { event.preventDefault(); setSubscribed(true); }}>
              <label>
                <span className={styles.srOnly}>Email</span>
                <input aria-label="Email" disabled={subscribed} placeholder="Email" required type="email" />
              </label>
              <button type="submit">{subscribed ? "Готово ✓" : "Подписаться"}</button>
            </form>
          </div>
          <div className={styles.footerLinks}>
            <Link href="/about">О бренде</Link>
            <Link href="/catalog">Каталог</Link>
            <Link href="/delivery">Доставка и оплата</Link>
            <Link href="/stores">Где нас найти</Link>
            <Link href="/support">Служба заботы</Link>
            <Link href="/order-status">Статус заказа</Link>
            <a href="mailto:hello@asaya.ru">hello@asaya.ru</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
