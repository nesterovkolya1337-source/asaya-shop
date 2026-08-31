"use client";

import Image from "next/image";
import Link from "next/link";
import { CookieConsent } from "@/components/cookie-consent";
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
            <Link href="/favorites">Избранное</Link>
            <Link href="/about">О бренде</Link>
            <Link href="/delivery">Доставка и оплата</Link>
            <Link href="/where-to-buy">Где купить</Link>
            <Link href="/instructions">Инструкции</Link>
            <Link href="/faq">Вопросы и ответы</Link>
            <Link href="/order-status">Статус заказа</Link>
            <Link href="/support">Служба заботы</Link>
          </div>
        </details>
        <Link className={styles.wordmark} href="/" aria-label="ASAYA — главная">
          <Image className={styles.brandLogo} alt="ASAYA" height={28} priority src={assetPath("/images/figma/footer-wordmark.svg")} width={114} />
        </Link>
        <div className={`${styles.navigationSide} ${styles.navigationEnd}`}>
          <Link className={`${styles.iconLink} ${styles.mobileOptional}`} href="/catalog#search" aria-label="Поиск">
            <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/></svg>
          </Link>
          <Link className={`${styles.iconLink} ${styles.mobileOptional}`} href="/favorites" aria-label={`Избранное: ${favorites.length}`}>
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M20.8 4.6a5.4 5.4 0 0 0-7.6 0L12 5.8l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6l1.2 1.2L12 21l7.6-7.6 1.2-1.2a5.4 5.4 0 0 0 0-7.6Z"/></svg>
            {favorites.length > 0 && <span className={styles.counter}>{favorites.length}</span>}
          </Link>
          <Link className={styles.iconLink} href="/account" aria-label="Личный кабинет">
            <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>
          </Link>
          <Link className={styles.iconLink} href="/cart" aria-label={`Корзина: ${cartCount}`}>
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
  return (
    <footer className={styles.footer} id="about">
      <div className={styles.footerInner}>
        <div className={styles.footerWordmark}>
          <Image alt="ASAYA" fill sizes="(max-width: 1200px) 86vw, 1040px" src={assetPath("/images/figma/footer-wordmark.svg")} />
        </div>
        <div className={styles.footerColumns}>
          <div className={styles.footerIntro}>
            <p className={styles.footerLead}>Косметика под настроение — для ухода, который хочется повторять.</p>
            <a className={styles.telegramButton} href="https://t.me/asayabeauty" rel="noreferrer" target="_blank">Читать ASAYA в Telegram</a>
            <div className={styles.socials} aria-label="Социальные сети ASAYA">
              <a aria-label="Telegram" href="https://t.me/asayabeauty" rel="noreferrer" target="_blank">TG</a>
              <a aria-label="ВКонтакте" href="https://vk.com/asaya.beauty" rel="noreferrer" target="_blank">VK</a>
              <a aria-label="Instagram" href="https://instagram.com/asaya.beauty" rel="noreferrer" target="_blank">IG</a>
              <a aria-label="Email" href="mailto:globalcos@yandex.ru">@</a>
            </div>
          </div>

          <nav className={styles.footerNav} aria-label="Навигация в подвале">
            <div>
              <p>Покупателям</p>
              <Link href="/catalog">Каталог</Link>
              <Link href="/delivery">Доставка и оплата</Link>
              <Link href="/instructions">Инструкции</Link>
              <Link href="/faq">Вопросы и ответы</Link>
              <Link href="/returns">Возврат и претензии</Link>
              <Link href="/order-status">Статус заказа</Link>
            </div>
            <div>
              <p>ASAYA</p>
              <Link href="/about">О бренде</Link>
              <Link href="/where-to-buy">Где купить</Link>
              <Link href="/support">Служба заботы</Link>
              <a href="https://t.me/asayahelp" rel="noreferrer" target="_blank">Поддержка в Telegram</a>
            </div>
          </nav>
        </div>
        <div className={styles.legalRow}>
          <span>© ASAYA</span>
          <div>
            <Link href="/legal/privacy">Политика конфиденциальности</Link>
            <Link href="/legal/personal-data">Согласие на обработку данных</Link>
            <Link href="/legal/offer">Публичная оферта</Link>
            <Link href="/legal/cookies">Файлы cookie</Link>
          </div>
        </div>
      </div>
      <details className={styles.supportBubble}>
        <summary>Помощь</summary>
        <div>
          <strong>Служба заботы</strong>
          <span>Подбор ухода, вопросы по применению, заказу или повреждённому товару.</span>
          <a href="https://t.me/asayahelp" rel="noreferrer" target="_blank">Написать в Telegram</a>
          <a href="mailto:globalcos@yandex.ru">Написать на email</a>
          <small>MAX — после подтверждения официальной ссылки</small>
        </div>
      </details>
      <CookieConsent />
    </footer>
  );
}
