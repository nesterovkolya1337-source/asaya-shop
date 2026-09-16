import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMetrikaRuntime, isMetrikaPage, metrikaPageUrl, ecommerceProduct, cartAnalyticsChanges, METRIKA_ID, METRIKA_SCRIPT } from '../src/lib/metrika.ts';

const product = { id: 'spray', sku: 'ASAYA-SPRAY-200', name: 'Мультиспрей', category: 'hair', price: 620.5, email: 'never@example.com', token: 'private' };
function fixture(href = 'https://asaya.ru/', consent = false) {
  const calls = [], scripts = [], frame = {};
  const browser = { location: { href }, top: frame, self: frame, dataLayer: [],
    document: { referrer: 'https://example.org/private?email=never@example.com', title: 'ASAYA',
      createElement: () => ({ remove() { this.removed = true; } }), head: { appendChild(s) { scripts.push(s); } } },
    ym: (...args) => calls.push(args), setTimeout, clearTimeout };
  const tracker = createMetrikaRuntime(browser, () => consent);
  return { browser, calls, scripts, tracker, consent(value) { consent = value; },
    load() { tracker.load(); scripts.at(-1)?.onload(); } };
}

test('no script, initialization or ecommerce before consent', async () => {
  const f = fixture();
  f.load(); f.tracker.productDetail(product); f.tracker.productClick(product);
  f.tracker.cartChanged({}, {spray: 2}, [product]); await f.tracker.checkoutRedirect();
  assert.equal(f.scripts.length, 0); assert.deepEqual(f.calls, []); assert.deepEqual(f.browser.dataLayer, []);
});

test('only the public HTTPS shop is tracked; no local, administrative or framed pages', () => {
  assert.equal(isMetrikaPage('https://asaya.ru/catalog/hair/'), true);
  assert.equal(isMetrikaPage('https://www.asaya.ru/cart/'), true);
  for (const url of ['http://asaya.ru/', 'http://127.0.0.1:3200/', 'https://localhost/',
    'https://asaya.ru.evil.test/', 'https://asaya.ru:444/', 'https://asaya.ru/manage/',
    'https://asaya.ru/admin/', 'https://asaya.ru/%61dmin/', 'https://asaya.ru/account/',
    'https://asaya.ru/checkout/', 'https://asaya.ru/order-status/?id=secret', 'https://asaya.ru/?asaya-preview=1']) {
    const f = fixture(url, true); f.load(); f.tracker.productDetail(product);
    assert.equal(f.scripts.length, 0, url); assert.equal(f.calls.length, 0, url);
  }
  assert.equal(isMetrikaPage('https://asaya.ru/', true), false);
});

test('URL projection keeps campaign attribution and strips arbitrary query/hash secrets', () => {
  const url = metrikaPageUrl('https://asaya.ru/catalog/?utm_source=yandex&utm_campaign=sale&yclid=123&email=a%40b.ru&token=secret#order-private');
  assert.equal(url, 'https://asaya.ru/catalog/?utm_source=yandex&utm_campaign=sale&yclid=123');
});

test('one script and init, one hit per SPA transition, including back navigation', () => {
  const f = fixture('https://asaya.ru/', true);
  f.load(); f.tracker.load(); f.tracker.sync();
  assert.equal(f.scripts.length, 1); assert.equal(f.scripts[0].src, METRIKA_SCRIPT);
  assert.equal(f.calls.filter(c => c[1] === 'init').length, 1);
  assert.equal(f.calls.filter(c => c[1] === 'hit').length, 1);
  const init = f.calls[0]; assert.equal(init[0], METRIKA_ID);
  assert.equal(init[2].defer, true); assert.equal(init[2].ecommerce, 'dataLayer');
  assert.equal(init[2].webvisor, true); assert.equal(init[2].referrer, 'https://example.org/');
  f.browser.location.href = 'https://asaya.ru/catalog/'; f.tracker.sync();
  f.browser.location.href = 'https://asaya.ru/'; f.tracker.sync();
  assert.equal(f.calls.filter(c => c[1] === 'hit').length, 3);
});

test('withdrawal while the library loads discards pending data without ever initializing', () => {
  const f = fixture('https://asaya.ru/product/spray/', true);
  f.tracker.load(); f.tracker.productDetail(product);
  f.consent(false); f.tracker.stop(); f.scripts[0].onload();
  assert.deepEqual(f.calls, []); assert.deepEqual(f.browser.dataLayer, []);
});

test('entering a private page destroys the counter and blocks queued and future events', () => {
  const f = fixture('https://asaya.ru/', true); f.load();
  f.browser.location.href = 'https://asaya.ru/account/?token=private';
  f.tracker.sync(); f.tracker.productClick(product);
  assert.equal(f.calls.at(-1)[1], 'destruct'); assert.deepEqual(f.browser.dataLayer, []);
  assert.equal(JSON.stringify(f.calls).includes('token=private'), false);
});

test('withdrawal stops collection; renewed consent starts a fresh page without replaying prior events', () => {
  const f = fixture('https://asaya.ru/', true); f.load();
  f.consent(false); f.tracker.sync(); f.tracker.cartChanged({}, {spray: 1}, [product]);
  assert.equal(f.calls.at(-1)[1], 'destruct');
  f.consent(true); f.tracker.load();
  assert.equal(f.scripts.length, 1); assert.equal(f.calls.filter(c => c[1] === 'init').length, 2);
  assert.deepEqual(f.browser.dataLayer, []);
});

test('detail is emitted once while loading and after rerenders, and again on a new visit', () => {
  const f = fixture('https://asaya.ru/product/spray/', true);
  f.tracker.load(); f.tracker.productDetail(product); f.tracker.productDetail(product);
  assert.equal(f.browser.dataLayer.length, 0);
  f.scripts[0].onload(); f.tracker.productDetail({...product});
  assert.equal(f.browser.dataLayer.length, 1);
  f.browser.location.href = 'https://asaya.ru/catalog/'; f.tracker.sync();
  f.browser.location.href = 'https://asaya.ru/product/spray/'; f.tracker.productDetail(product);
  assert.equal(f.browser.dataLayer.length, 2);
});

test('ecommerce uses real SKU, rubles and a fixed field projection; demo and invalid products are skipped', () => {
  assert.deepEqual(ecommerceProduct(product, 2), {id:product.sku, name:product.name, brand:'ASAYA', category:'hair', price:620.5, quantity:2});
  assert.equal(ecommerceProduct({...product, sku:undefined}), null);
  assert.equal(ecommerceProduct({...product, price:NaN}), null);
  assert.equal(ecommerceProduct(product, 0), null);
  assert.equal(ecommerceProduct(product, 101), null);
  assert.equal(ecommerceProduct(product, 1.5), null);
});

test('cart reports actual quantity differences, not totals or repeated unchanged snapshots', () => {
  assert.deepEqual(cartAnalyticsChanges({spray:2}, {spray:2}, [product]), []);
  const [added] = cartAnalyticsChanges({spray:2}, {spray:5}, [product]);
  assert.equal(added.action, 'add'); assert.equal(added.product.quantity, 3);
  const [removed] = cartAnalyticsChanges({spray:5}, {}, [product]);
  assert.equal(removed.action, 'remove'); assert.equal(removed.product.quantity, 5);
  assert.deepEqual(cartAnalyticsChanges({}, {unknown:1}, [product]), []);
});

test('checkout goal is bounded and never records a purchase', async () => {
  const f = fixture('https://asaya.ru/cart/', true); f.load();
  const original = f.browser.ym;
  f.browser.ym = (...args) => { original(...args); if(args[1]==='reachGoal') args[4](); };
  await f.tracker.checkoutRedirect();
  assert.equal(f.calls.at(-1)[2], 'yandex_checkout'); assert.deepEqual(f.browser.dataLayer, []);
  f.browser.ym = original;
  const start = Date.now(); await f.tracker.checkoutRedirect();
  assert.ok(Date.now()-start < 1500); assert.equal(JSON.stringify(f.calls).includes('purchase'), false);
});

test('script and SDK failures do not break shopping or release events without consent', async () => {
  const f = fixture('https://asaya.ru/', true);
  f.tracker.load(); f.scripts[0].onerror(); assert.equal(f.scripts[0].removed, true);
  f.load(); assert.equal(f.scripts.length, 2);
  f.browser.ym = () => { throw new Error('blocked'); };
  f.browser.dataLayer.push = () => { throw new Error('blocked'); };
  assert.doesNotThrow(() => f.tracker.cartChanged({}, {spray:1}, [product]));
  await assert.doesNotReject(f.tracker.checkoutRedirect());
});
