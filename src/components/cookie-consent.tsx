"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import styles from "./site-shell.module.css";

type CookieChoice = "essential" | "analytics";

const COOKIE_CHOICE_KEY = "asaya-cookie-choice-v1";

export function CookieConsent() {
  const [ready, setReady] = useState(false);
  const [choice, setChoice] = useState<CookieChoice | null>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem(COOKIE_CHOICE_KEY);
    queueMicrotask(() => {
      if (saved === "essential" || saved === "analytics") setChoice(saved);
      setReady(true);
    });
  }, []);

  function choose(nextChoice: CookieChoice) {
    window.localStorage.setItem(COOKIE_CHOICE_KEY, nextChoice);
    setChoice(nextChoice);
  }

  if (!ready || choice) return null;

  return (
    <aside aria-label="Настройка файлов cookie" aria-live="polite" className={styles.cookieBanner}>
      <div>
        <strong>Ваш выбор важен</strong>
        <p>Обязательные cookie нужны для корзины и настроек сайта. Аналитика будет включаться только с вашего согласия после подключения соответствующего сервиса.</p>
        <Link href="/legal/cookies">Подробнее о cookie</Link>
      </div>
      <div className={styles.cookieActions}>
        <button onClick={() => choose("essential")} type="button">Только необходимые</button>
        <button onClick={() => choose("analytics")} type="button">Разрешить аналитику</button>
      </div>
    </aside>
  );
}
