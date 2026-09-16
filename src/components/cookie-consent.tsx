"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { readCookieChoice, saveCookieChoice, subscribeCookieChoice, COOKIE_SETTINGS_EVENT, type CookieChoice } from '@/lib/analytics-consent';
import styles from "./site-shell.module.css";

export function CookieConsent() {
  const [ready, setReady] = useState(false);
  const [choice, setChoice] = useState<CookieChoice | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      setChoice(readCookieChoice());
      setReady(true);
    });
    const unsubscribe = subscribeCookieChoice(() => setChoice(readCookieChoice()));
    const open = () => setSettingsOpen(true);
    window.addEventListener(COOKIE_SETTINGS_EVENT, open);
    return () => { unsubscribe(); window.removeEventListener(COOKIE_SETTINGS_EVENT, open); };
  }, []);

  function choose(nextChoice: CookieChoice) {
    saveCookieChoice(nextChoice);
    setChoice(nextChoice);
    setSettingsOpen(false);
  }

  if (!ready || (choice && !settingsOpen)) return null;

  return (
    <aside aria-label="Настройка файлов cookie" aria-live="polite" className={styles.cookieBanner}>
      <div>
        <strong>Ваш выбор важен</strong>
        <p>Обязательные cookie нужны для корзины и настроек сайта. С вашего согласия Яндекс Метрика собирает статистику посещений и действий на сайте, включая запись взаимодействия со страницами.</p>
        <Link href="/legal/privacy/">Политика конфиденциальности</Link>
      </div>
      <div className={styles.cookieActions}>
        <button onClick={() => choose("essential")} type="button">Только необходимые</button>
        <button onClick={() => choose("analytics")} type="button">Разрешить аналитику</button>
      </div>
    </aside>
  );
}

export function CookieSettingsButton() {
  return <button className={styles.cookieSettings} onClick={() => window.dispatchEvent(new Event(COOKIE_SETTINGS_EVENT))} type="button">Настройки cookie</button>;
}
