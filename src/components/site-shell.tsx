"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { CookieConsent } from "@/components/cookie-consent";
import { useShop } from "@/components/shop-provider";
import { assetPath } from "@/lib/asset-path";
import { companyData } from "@/lib/company-data";
import styles from "./site-shell.module.css";

export function SiteHeader({ overlay = false }: { overlay?: boolean }) {
  const { cartCount, favorites, products } = useShop();
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLDetailsElement>(null);
  const sitePages = [
    ["Каталог", "/catalog"], ["О бренде", "/about"], ["Инструкции", "/instructions"],
    ["Доставка и оплата", "/delivery"], ["Где купить", "/where-to-buy"],
    ["Вопросы и ответы", "/faq"], ["Служба заботы", "/support"],
    ["Возврат и претензии", "/returns"], ["Реквизиты", "/requisites"],
  ];
  const normalizedSearch = search.trim().toLocaleLowerCase("ru");
  const searchResults = useMemo(() => normalizedSearch ? products.filter((product) => (
    `${product.name} ${product.description} ${product.aroma} ${product.features.join(" ")}`.toLocaleLowerCase("ru").includes(normalizedSearch)
  )).slice(0, 8) : [], [normalizedSearch, products]);
  const pageResults = normalizedSearch ? sitePages.filter(([label]) => label.toLocaleLowerCase("ru").includes(normalizedSearch)) : sitePages.slice(0, 4);

  useEffect(() => {
    if (!menuOpen) return;
    const closeFromOutside = (event: PointerEvent) => {
      if (!window.matchMedia("(min-width: 721px)").matches) return;
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const closeFromKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape" && window.matchMedia("(min-width: 721px)").matches) setMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeFromOutside);
    document.addEventListener("keydown", closeFromKeyboard);
    return () => {
      document.removeEventListener("pointerdown", closeFromOutside);
      document.removeEventListener("keydown", closeFromKeyboard);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!overlay) return;
    let animationFrame = 0;

    const updateHeader = () => {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(() => {
        const header = headerRef.current;
        const hero = document.querySelector<HTMLElement>("[data-site-hero]");
        const promo = document.querySelector<HTMLElement>("[data-site-promo]");
        if (!header || !hero) return;

        const fadeDistance = Math.max(220, Math.min(hero.offsetHeight * 0.72, 520));
        const progress = Math.min(1, Math.max(0, (window.scrollY - 12) / fadeDistance));
        const restingTop = window.innerWidth <= 720 ? 8 : 10;
        const promoGap = window.innerWidth <= 720 ? 8 : 10;
        const headerTop = Math.max(restingTop, (promo?.getBoundingClientRect().bottom ?? 0) + promoGap);
        const ink = Math.round(255 - progress * 223);

        header.style.setProperty("--header-top", `${headerTop}px`);
        header.style.setProperty("--header-bg-alpha", (progress * 0.96).toFixed(3));
        header.style.setProperty("--header-border-alpha", (progress * 0.08).toFixed(3));
        header.style.setProperty("--header-shadow-alpha", (progress * 0.08).toFixed(3));
        header.style.setProperty("--header-blur", `${Math.round(progress * 14)}px`);
        header.style.setProperty("--header-ink", `${ink}`);
        header.style.setProperty("--header-logo-invert", `${1 - progress}`);
      });
    };
    updateHeader();
    window.addEventListener("scroll", updateHeader, { passive: true });
    window.addEventListener("resize", updateHeader);
    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("scroll", updateHeader);
      window.removeEventListener("resize", updateHeader);
    };
  }, [overlay]);

  return (
    <header className={`${styles.header} ${overlay ? styles.overlayPlacement : ""}`} ref={headerRef}>
      <nav aria-label="Основная навигация" className={styles.navigation}>
        <div className={styles.navigationStart}>
          <details className={styles.mobileMenu} open={menuOpen} ref={menuRef}>
            <summary aria-expanded={menuOpen} aria-label={menuOpen ? "Закрыть меню" : "Открыть меню"} onClick={(event) => { event.preventDefault(); setMenuOpen((open) => !open); }} role="button">
              <span />
              <span />
              <span />
            </summary>
            <div className={styles.mobileMenuPanel}>
              <Link className={styles.mobileMenuPrimary} href="/catalog" onClick={() => setMenuOpen(false)}>Каталог</Link>
              <Link href="/favorites" onClick={() => setMenuOpen(false)}>Избранное</Link>
              <Link className={styles.mobileMenuPrimary} href="/about" onClick={() => setMenuOpen(false)}>О бренде</Link>
              <Link href="/delivery" onClick={() => setMenuOpen(false)}>Доставка и оплата</Link>
              <Link href="/where-to-buy" onClick={() => setMenuOpen(false)}>Где купить</Link>
              <Link href="/instructions" onClick={() => setMenuOpen(false)}>Инструкции</Link>
              <Link href="/faq" onClick={() => setMenuOpen(false)}>Вопросы и ответы</Link>
              <Link href="/order-status" onClick={() => setMenuOpen(false)}>Статус заказа</Link>
              <Link href="/support" onClick={() => setMenuOpen(false)}>Служба заботы</Link>
              <Link href="/returns" onClick={() => setMenuOpen(false)}>Возвраты и претензии</Link>
              <Link href="/requisites" onClick={() => setMenuOpen(false)}>Реквизиты</Link>
            </div>
          </details>
          <div className={styles.navigationSide}>
            <Link href="/catalog">Каталог</Link>
            <Link href="/about">О бренде</Link>
          </div>
        </div>
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
      <div className={styles.promo} data-site-promo>Бесплатная доставка при заказе от 1500 ₽</div>
      {overlay ? <div className={styles.heroHeaderSlot}><SiteHeader overlay /></div> : <SiteHeader />}
    </>
  );
}

export function SiteFooter() {
  return (
    <footer className={styles.footer} id="about">
      <div className={styles.footerInner}>
        <div className={styles.footerBrand}>
          <Image alt="ASAYA" className={styles.footerWordmark} height={256} src={assetPath("/images/figma/footer-wordmark.svg")} width={1040} />
        </div>
        <div className={styles.footerColumns}>
          <div className={styles.footerIntro}>
            <p className={styles.footerEyebrow}>ASAYA рядом</p>
            <div className={styles.footerSocialRow}>
              <h2 className={styles.footerLead}>Следи за нами</h2>
              <div className={styles.socials} aria-label="Социальные сети ASAYA">
                <a aria-label="ASAYA в Telegram" href="https://t.me/asayabeauty" rel="noreferrer" target="_blank" title="Telegram"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M20.7 3.5 3.8 10c-1.2.5-1.2 1.1-.2 1.4l4.3 1.3 1.7 5.2c.2.6.1.9.8.9.5 0 .8-.2 1.1-.5l2.2-2.1 4.5 3.3c.8.5 1.4.2 1.6-.8l2.9-13.8c.3-1.2-.5-1.8-1.5-1.4Z"/><path d="m8 12.6 10.2-6.4-8.4 7.7-.3 3.3"/></svg></a>
                <a aria-label="ASAYA во ВКонтакте" href="https://vk.com/asaya.beauty" rel="noreferrer" target="_blank" title="ВКонтакте"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3.2 5.8h3.2c.3 0 .6.2.7.5.7 2.3 1.9 4.4 3.5 6V6.6c0-.5.4-.8.8-.8h3c.4 0 .8.4.8.8v3.2c1.4-1.3 2.5-2.6 3.2-3.6.2-.3.5-.4.8-.4h3c.7 0 1.1.8.7 1.3-1 1.6-2.3 3.2-3.8 4.7 1.6 1.5 3 3.2 4.1 5 .4.6 0 1.4-.7 1.4h-3.2c-.3 0-.6-.1-.8-.4-1-1.3-2-2.5-3.3-3.5v3.1c0 .4-.4.8-.8.8h-1.6c-4.6 0-8.7-3.9-10.4-11.3-.1-.5.3-1.1.8-1.1Z"/></svg></a>
                <a aria-label="ASAYA в Instagram" href="https://instagram.com/asaya.beauty" rel="noreferrer" target="_blank" title="Instagram"><svg aria-hidden="true" viewBox="0 0 24 24"><rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.8" r=".8" className={styles.socialDot}/></svg></a>
              </div>
            </div>
          </div>

          <nav className={styles.footerNav} aria-label="Навигация в подвале">
            <div>
              <p>Покупателям</p>
              <Link href="/catalog">Каталог</Link>
              <Link href="/delivery">Доставка и оплата</Link>
              <Link href="/order-status">Статус заказа</Link>
              <Link href="/instructions">Инструкции</Link>
              <Link href="/faq">Вопросы и ответы</Link>
              <Link href="/returns">Возврат и претензии</Link>
              <Link href="/support">Служба заботы</Link>
            </div>
            <div>
              <p>ASAYA</p>
              <Link href="/about">О бренде</Link>
              <Link href="/where-to-buy">Где купить</Link>
              <Link href="/account">Личный кабинет</Link>
              <Link href="/requisites">Реквизиты</Link>
            </div>
          </nav>
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
          <a href={companyData.supportEmailHref}>{companyData.supportEmail}</a>
        </div>
      </details>
      <CookieConsent />
    </footer>
  );
}
