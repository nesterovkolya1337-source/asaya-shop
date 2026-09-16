"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import { CookieConsent, CookieSettingsButton } from "@/components/cookie-consent";
import { useShop } from "@/components/shop-provider";
import { assetPath } from "@/lib/asset-path";
import {useSiteDocument} from './site-content-provider';
import styles from "./site-shell.module.css";

const contentImage=(url:string)=>url.startsWith('/')?assetPath(url):url;
function ContentLink({href,children,...props}:Omit<ComponentProps<'a'>,'href'>&{href:string}){
 return href.startsWith('/')?<Link href={href} {...props}>{children}</Link>:<a href={href} target={href.startsWith('https:')?'_blank':undefined} rel="noreferrer" {...props}>{children}</a>;
}

export function SiteHeader({ overlay = false }: { overlay?: boolean }) {
  const { cartCount, favorites, products } = useShop();
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLDetailsElement>(null);
  const {page,attrs}=useSiteDocument('header');
  const blocks=page.blocks.filter(b=>b.visible),brand=blocks.find(b=>b.type==='siteBrand'),navigation=blocks.find(b=>b.type==='siteNavigation'),menu=blocks.find(b=>b.type==='siteMenu');
  const sitePages=(menu?.items??[]).filter(item=>item.href&&item.title).map(item=>[item.title,item.href]);
  const normalizedSearch = search.trim().toLocaleLowerCase("ru");
  const searchResults = useMemo(() => normalizedSearch ? products.filter((product) => (
    product.active&&`${product.name} ${product.description} ${product.aroma} ${product.features.join(" ")}`.toLocaleLowerCase("ru").includes(normalizedSearch)
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
          {menu&&<details className={styles.mobileMenu} open={menuOpen} ref={menuRef} {...attrs(menu)}>
            <summary aria-expanded={menuOpen} aria-label={menuOpen ? "Закрыть меню" : "Открыть меню"} onClick={(event) => { event.preventDefault(); setMenuOpen((open) => !open); }} role="button">
              <span />
              <span />
              <span />
            </summary>
            <div className={styles.mobileMenuPanel}>
              {menu.items.filter(item=>item.href&&item.title).map((item,i)=><ContentLink className={i===0?styles.mobileMenuPrimary:undefined} href={item.href} key={i} onClick={()=>setMenuOpen(false)}>{item.title}</ContentLink>)}
            </div>
          </details>}
          {navigation&&<div className={styles.navigationSide} {...attrs(navigation)}>
            {navigation.items.filter(item=>item.href&&item.title).map((item,i)=><ContentLink key={i} href={item.href}>{item.title}</ContentLink>)}
          </div>}
        </div>
        {brand&&<Link className={styles.wordmark} href="/" aria-label={(brand.values.alt||'ASAYA')+' — главная'} {...attrs(brand)}>
          {brand.values.image?<Image unoptimized className={`${styles.brandLogo} ${brand.values.image==='/images/figma/footer-wordmark.svg'?'':styles.customLogo}`} alt={brand.values.alt||''} height={28} priority src={contentImage(brand.values.image)} width={114}/>:<span>{brand.values.alt}</span>}
        </Link>}
        <div className={`${styles.navigationSide} ${styles.navigationEnd}`}>
          <button data-preview-interactive aria-expanded={searchOpen} className={styles.iconLink} onClick={() => setSearchOpen(true)} type="button" aria-label="Поиск по сайту">
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
          <header><span>Поиск по всему сайту</span><button data-preview-interactive aria-label="Закрыть поиск" onClick={() => setSearchOpen(false)} type="button">×</button></header>
          <label><svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/></svg><input data-preview-interactive autoFocus onChange={(event) => setSearch(event.target.value)} placeholder="Товар, инструкция или раздел" type="search" value={search} /></label>
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

export function SiteChrome({overlay=false}:{overlay?:boolean}){
 const {catalogOnly}=useShop(),{page,attrs,isDefault}=useSiteDocument('header');
 const announcement=page.blocks.find(b=>b.type==='siteAnnouncement'&&b.visible);
 return <>{announcement&&<div className={styles.promo} data-site-promo {...attrs(announcement)}>{announcement.values.href?<ContentLink href={announcement.values.href}>{announcement.values.text}</ContentLink>:isDefault&&catalogOnly?'ASAYA · Уход за собой каждый день':announcement.values.text}</div>}{overlay?<div className={styles.heroHeaderSlot}><SiteHeader overlay/></div>:<SiteHeader/>}</>;
}
function SocialIcon({href}:{href:string}){
 let host='';try{host=new URL(href).hostname.replace(/^www\./,'');}catch{}
 if(host==='t.me')return <svg data-social="telegram" aria-hidden="true" viewBox="0 0 24 24"><path d="M20.7 3.5 3.8 10c-1.2.5-1.2 1.1-.2 1.4l4.3 1.3 1.7 5.2c.2.6.1.9.8.9.5 0 .8-.2 1.1-.5l2.2-2.1 4.5 3.3c.8.5 1.4.2 1.6-.8l2.9-13.8c.3-1.2-.5-1.8-1.5-1.4Z"/><path d="m8 12.6 10.2-6.4-8.4 7.7-.3 3.3"/></svg>;
 if(host==='vk.com')return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3.2 5.8h3.2c.3 0 .6.2.7.5.7 2.3 1.9 4.4 3.5 6V6.6c0-.5.4-.8.8-.8h3c.4 0 .8.4.8.8v3.2c1.4-1.3 2.5-2.6 3.2-3.6.2-.3.5-.4.8-.4h3c.7 0 1.1.8.7 1.3-1 1.6-2.3 3.2-3.8 4.7 1.6 1.5 3 3.2 4.1 5 .4.6 0 1.4-.7 1.4h-3.2c-.3 0-.6-.1-.8-.4-1-1.3-2-2.5-3.3-3.5v3.1c0 .4-.4.8-.8.8h-1.6c-4.6 0-8.7-3.9-10.4-11.3-.1-.5.3-1.1.8-1.1Z"/></svg>;
 if(host==='instagram.com')return <svg data-social="outline" aria-hidden="true" viewBox="0 0 24 24"><rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.8" r=".8" className={styles.socialDot}/></svg>;
 return <svg data-social="outline" aria-hidden="true" viewBox="0 0 24 24"><path d="M5 19 19 5M5 5h14v14"/></svg>;
}
export function SiteFooter(){
 const {page,attrs}=useSiteDocument('footer'),blocks=page.blocks.filter(b=>b.visible);
 const brand=blocks.find(b=>b.type==='siteBrand'),social=blocks.find(b=>b.type==='siteSocial'),legal=blocks.find(b=>b.type==='siteLegal'),help=blocks.find(b=>b.type==='siteHelp');
 const columns=blocks.filter(b=>b.type==='footerLinks');
 return <footer className={styles.footer} id="about">
  <div className={styles.footerInner}>
   {brand&&<div className={styles.footerBrand} {...attrs(brand)}>{brand.values.image?<Image unoptimized alt={brand.values.alt||''} className={styles.footerWordmark} height={256} src={contentImage(brand.values.image)} width={1040}/>:<span>{brand.values.alt}</span>}</div>}
   <div className={styles.footerColumns}>
    {social&&<div className={styles.footerIntro} {...attrs(social)}><p className={styles.footerEyebrow}>{social.values.eyebrow}</p><div className={styles.footerSocialRow}><h2 className={styles.footerLead}>{social.values.title}</h2><div className={styles.socials} aria-label="Социальные сети ASAYA">{social.items.filter(item=>item.href&&item.title).map((item,i)=><ContentLink key={i} aria-label={item.title} title={item.title} href={item.href}><SocialIcon href={item.href}/></ContentLink>)}</div></div></div>}
    <nav className={styles.footerNav} aria-label="Навигация в подвале">{columns.map(b=><div key={b.id} {...attrs(b)}><p>{b.values.title}</p>{b.items.filter(item=>item.href&&item.title).map((item,i)=><ContentLink key={i} href={item.href}>{item.title}</ContentLink>)}</div>)}</nav>
   </div>
   {legal&&<div className={styles.legalRow} {...attrs(legal)}><span>{legal.values.text}</span><div>{legal.items.filter(item=>item.href&&item.title).map((item,i)=><ContentLink key={i} href={item.href}>{item.title}</ContentLink>)}<CookieSettingsButton/></div></div>}
   {!legal&&<div className={styles.legalRow}><CookieSettingsButton/></div>}
  </div>
  {help&&<details className={styles.supportBubble} {...attrs(help)}><summary>{help.values.buttonText}</summary><div><strong>{help.values.title}</strong><span>{help.values.text}</span>{help.items.filter(item=>item.href&&item.title).map((item,i)=><ContentLink key={i} href={item.href}>{item.title}</ContentLink>)}</div></details>}
  <CookieConsent/>
 </footer>;
}
