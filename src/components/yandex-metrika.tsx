"use client";

import { usePathname } from 'next/navigation';
import { useEffect, useLayoutEffect, useSyncExternalStore } from 'react';
import { readCookieChoice, subscribeCookieChoice } from '@/lib/analytics-consent';
import { getMetrika, isMetrikaPage } from '@/lib/metrika';
import { useShop } from './shop-provider';

const subscribeMounted = () => () => {};
export function YandexMetrika() {
  const pathname = usePathname();
  const choice = useSyncExternalStore(subscribeCookieChoice, readCookieChoice, () => null);
  const mounted = useSyncExternalStore(subscribeMounted, () => true, () => false);
  const { products, catalogStatus } = useShop();
  const enabled = mounted && choice === 'analytics' && isMetrikaPage(window.location.href, window.top !== window);

  useLayoutEffect(() => {
    const metrika = getMetrika();
    if (!enabled) { metrika?.stop(); return; }
    metrika?.load();
    if (catalogStatus === 'ready' && pathname?.startsWith('/product/')) {
      const id = pathname.split('/')[2], product = products.find(p => p.id === id);
      if (product) metrika?.productDetail(product);
    }
  }, [enabled, choice, pathname, products, catalogStatus]);

  useEffect(() => {
    // Consent changes also stop the tracker before another component can emit an event.
    return subscribeCookieChoice(() => { if (readCookieChoice() !== 'analytics') getMetrika()?.stop(); });
  }, []);

  return null;
}
