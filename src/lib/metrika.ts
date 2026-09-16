import { readCookieChoice } from './analytics-consent.ts';

export const METRIKA_ID = 112354678;
export const METRIKA_SCRIPT = `https://mc.yandex.ru/metrika/tag.js?id=${METRIKA_ID}`;
const hosts = new Set(['asaya.ru', 'www.asaya.ru']);
const privatePath = /^\/(?:manage|admin|account|checkout|order-status|api)(?:\/|$)/i;
const campaignKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'yclid'];

export function isMetrikaPage(href: string, framed = false) {
  try {
    const url = new URL(href);
    return !framed && url.protocol === 'https:' && hosts.has(url.hostname) && !url.port &&
      !privatePath.test(decodeURIComponent(url.pathname)) && !url.searchParams.has('asaya-preview');
  } catch { return false; }
}

// Keep campaign attribution, but never send account tokens, order lookups,
// email addresses from forms, or arbitrary query/hash values as page URLs.
export function metrikaPageUrl(href: string) {
  const source = new URL(href), result = new URL(source.pathname, source.origin);
  for (const key of campaignKeys) {
    const value = source.searchParams.get(key);
    if (value && value.length <= 256) result.searchParams.set(key, value);
  }
  return result.href;
}

function metrikaReferrer(href: string) {
  if (!href) return '';
  try {
    const url = new URL(href);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    // Referrer origin is sufficient for source attribution; private paths stay private.
    return `${url.origin}/`;
  } catch { return ''; }
}

export type AnalyticsProduct = { id: string; sku?: string; name: string; category: string; price: number };
type EcommerceProduct = { id: string; name: string; brand: string; category: string; price: number; quantity: number };
type EcommerceAction = 'detail' | 'click' | 'add' | 'remove';
type EcommerceEvent = { ecommerce: { currencyCode: 'RUB' } & Partial<Record<EcommerceAction, { products: EcommerceProduct[] }>> };
type Ym = ((id: number, method: string, ...args: unknown[]) => void) & { a?: unknown[][]; l?: number };
export type MetrikaBrowser = Pick<Window, 'document' | 'location' | 'top' | 'self' | 'setTimeout' | 'clearTimeout'> & {
  ym?: Ym;
  dataLayer?: EcommerceEvent[];
};

export function ecommerceProduct(product: AnalyticsProduct, quantity = 1): EcommerceProduct | null {
  // Demo products do not have real SKUs and must not enter business reports.
  if (!product.sku?.trim() || !product.name || !Number.isFinite(product.price) || product.price < 0 ||
    !Number.isInteger(quantity) || quantity < 1 || quantity > 100) return null;
  return { id: product.sku, name: product.name, brand: 'ASAYA', category: product.category,
    price: Math.round(product.price * 100) / 100, quantity };
}

export function cartAnalyticsChanges(before: Record<string, number>, after: Record<string, number>, products: AnalyticsProduct[]) {
  const changes: { action: 'add' | 'remove'; product: EcommerceProduct }[] = [];
  for (const id of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const delta = (after[id] ?? 0) - (before[id] ?? 0), product = products.find(p => p.id === id);
    if (!delta || !product) continue;
    const item = ecommerceProduct(product, Math.abs(delta));
    if (item) changes.push({ action: delta > 0 ? 'add' : 'remove', product: item });
  }
  return changes;
}

export function createMetrikaRuntime(browser: MetrikaBrowser, consent: () => boolean) {
  let loaded = false, initialized = false, lastPage = '', detailKey = '', contextPage = '', scriptRequested = false;
  let pending: EcommerceEvent[] = [];
  const allowed = () => consent() && isMetrikaPage(browser.location.href, browser.top !== browser.self);
  const call = (method: string, ...args: unknown[]) => {
    try { browser.ym?.(METRIKA_ID, method, ...args); } catch { /* Analytics never blocks the store. */ }
  };
  const push = (event: EcommerceEvent) => {
    try { browser.dataLayer?.push(event); } catch { /* A blocked tracker cannot break cart actions. */ }
  };
  const stop = () => {
    if (initialized) call('destruct');
    initialized = false;
    lastPage = '';
    detailKey = '';
    contextPage = '';
    pending = [];
    if (browser.dataLayer) browser.dataLayer.length = 0;
  };
  const prepare = () => {
    if (!allowed()) { stop(); return false; }
    const page = metrikaPageUrl(browser.location.href);
    if (contextPage !== page) { detailKey = ''; contextPage = page; }
    if (!browser.ym) {
      const stub: Ym = (...args) => { (stub.a ??= []).push(args); };
      stub.l = Date.now();
      browser.ym = stub;
    }
    browser.dataLayer ??= [];
    return true;
  };
  const sync = () => {
    if (!prepare() || !loaded) return;
    const url = metrikaPageUrl(browser.location.href);
    if (!initialized) {
      call('init', { ssr: true, defer: true, webvisor: true, clickmap: true, ecommerce: 'dataLayer',
        referrer: metrikaReferrer(browser.document.referrer), url, accurateTrackBounce: true, trackLinks: true });
      initialized = true;
    }
    if (lastPage !== url) {
      call('hit', url, { title: browser.document.title, referer: lastPage || metrikaReferrer(browser.document.referrer) });
      lastPage = url;
    }
    if (pending.length) {
      const events = pending;
      pending = [];
      for (const event of events) push(event);
    }
  };
  const ecommerce = (action: EcommerceAction, products: EcommerceProduct[]) => {
    if (!allowed() || !products.length) return false;
    sync();
    const event: EcommerceEvent = { ecommerce: { currencyCode: 'RUB', [action]: { products } } };
    if (initialized) push(event);
    else if (pending.length < 50) pending.push(event);
    return true;
  };
  return {
    prepare, sync, stop,
    load() {
      if (!prepare()) return;
      sync();
      if (scriptRequested) return;
      scriptRequested = true;
      const script = browser.document.createElement('script');
      script.id = 'asaya-metrika';
      script.async = true;
      script.src = METRIKA_SCRIPT;
      script.onload = () => { loaded = true; sync(); };
      script.onerror = () => { script.remove(); scriptRequested = false; pending = []; detailKey = ''; };
      browser.document.head.appendChild(script);
    },
    productDetail(product: AnalyticsProduct) {
      const item = ecommerceProduct(product);
      if (!item || !allowed()) return;
      sync();
      const key = `${metrikaPageUrl(browser.location.href)}:${item.id}`;
      if (detailKey === key) return;
      if (ecommerce('detail', [item])) detailKey = key;
    },
    productClick(product: AnalyticsProduct) {
      const item = ecommerceProduct(product);
      if (item) ecommerce('click', [item]);
    },
    cartChanged(before: Record<string, number>, after: Record<string, number>, products: AnalyticsProduct[]) {
      const changes = cartAnalyticsChanges(before, after, products);
      for (const action of ['add', 'remove'] as const) {
        ecommerce(action, changes.filter(c => c.action === action).map(c => c.product));
      }
    },
    checkoutRedirect(): Promise<void> {
      // This is a transition goal, never a purchase. No order/contact/token data.
      if (!allowed() || !loaded) return Promise.resolve();
      sync();
      return new Promise(resolve => {
        const timer = browser.setTimeout(resolve, 500);
        call('reachGoal', 'yandex_checkout', {}, () => { browser.clearTimeout(timer); resolve(); });
      });
    },
  };
}

let runtime: ReturnType<typeof createMetrikaRuntime> | undefined;
export function getMetrika() {
  if (typeof window === 'undefined') return undefined;
  return runtime ??= createMetrikaRuntime(window, () => readCookieChoice() === 'analytics');
}
