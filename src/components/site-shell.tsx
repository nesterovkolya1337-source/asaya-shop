"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CookieConsent } from "@/components/cookie-consent";
import { useShop } from "@/components/shop-provider";
import { assetPath } from "@/lib/asset-path";
import { companyData } from "@/lib/company-data";
import styles from "./site-shell.module.css";

export function SiteHeader({ overlay = false }: { overlay?: boolean }) {
  const { cartCount, favorites, products } = useShop();
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [scrolled, setScrolled] = useState(false);
  const sitePages = [
    ["Каталог", "/catalog"], ["О бренде", "/about"], ["Инструкции", "/instructions"],
    ["Доставка и оплата", "/delivery"], ["Где купить", "/where-to-buy"],
    ["Вопросы и ответы", "/faq"], ["Служба заботы", "/support"],
  ];
  const normalizedSearch = search.trim().toLocaleLowerCase("ru");
  const searchResults = useMemo(() => normalizedSearch ? products.filter((product) => (
    `${product.name} ${product.description} ${product.aroma} ${product.features.join(" ")}`.toLocaleLowerCase("ru").includes(normalizedSearch)
  )).slice(0, 8) : [], [normalizedSearch, products]);
  const pageResults = normalizedSearch ? sitePages.filter(([label]) => label.toLocaleLowerCase("ru").includes(normalizedSearch)) : sitePages.slice(0, 4);

  useEffect(() => {
    if (!overlay) return;
    const updateHeader = () => setScrolled(window.scrollY > 48);
    updateHeader();
    window.addEventListener("scroll", updateHeader, { passive: true });
    return () => window.removeEventListener("scroll", updateHeader);
  }, [overlay]);

  return (
    <header className={`${styles.header} ${overlay && !scrolled ? styles.overlay : ""}`}>
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
          <button aria-expanded={searchOpen} className={styles.iconLink} onClick={() => setSearchOpen(true)} type="button" aria-label="Поиск по сайту">
            <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/></svg>
          </button>
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
      {searchOpen && <div className={styles.searchBackdrop} onClick={() => setSearchOpen(false)}>
        <section aria-label="Поиск по сайту" aria-modal="true" className={styles.searchPanel} onClick={(event) => event.stopPropagation()} role="dialog">
          <header><span>Поиск по всему сайту</span><button aria-label="Закрыть поиск" onClick={() => setSearchOpen(false)} type="button">×</button></header>
          <label><svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/></svg><input autoFocus onChange={(event) => setSearch(event.target.value)} placeholder="Товар, инструкция или раздел" type="search" value={search} /></label>
          <div className={styles.searchResults}>
            {searchResults.map((product) => <Link href={`/product/${product.id}`} key={product.id} onClick={() => setSearchOpen(false)}><Image alt="" height={70} src={product.image} width={52} /><span><strong>{product.name}</strong><small>Товар · {product.volume}</small></span><b>→</b></Link>)}
            {pageResults.map(([label, href]) => <Link href={href} key={href} onClick={() => setSearchOpen(false)}><span><strong>{label}</strong><small>Раздел сайта</small></span><b>→</b></Link>)}
            {normalizedSearch && !searchResults.length && !pageResults.length && <p>Ничего не найдено. Попробуйте название продукта или раздела.</p>}
          </div>
        </section>
      </div>}
    </header>
  );
}

export function SiteChrome({ overlay = false }: { overlay?: boolean }) {
  return (
    <>
      <div className={styles.promo}>Бесплатная доставка при заказе от 1500 ₽</div>
      <SiteHeader overlay={overlay} />
    </>
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
              <a aria-label="Email" href={companyData.emailHref}>@</a>
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
        <div className={styles.companyDetails}>
          <div>
            <strong>{companyData.shortName}</strong>
            <span>ОГРН {companyData.ogrn} · ИНН {companyData.inn}</span>
          </div>
          <address>{companyData.legalAddress}</address>
          <div className={styles.companyContacts}>
            <a href={companyData.phoneHref}>{companyData.phone}</a>
            <a href={companyData.emailHref}>{companyData.email}</a>
          </div>
        </div>
        <div className={styles.legalRow}>
          <span>© 2026 ASAYA</span>
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
          <a href="https://t.me/asayahelp" rel="noreferrer" target="_blank">Telegram · @asayahelp</a>
          <a href={companyData.emailHref}>{companyData.email}</a>
          <a href={companyData.phoneHref}>{companyData.phone}</a>
        </div>
      </details>
      <CookieConsent />
    </footer>
  );
}
