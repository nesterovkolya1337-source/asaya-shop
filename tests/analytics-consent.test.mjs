import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readCookieChoice, saveCookieChoice, subscribeCookieChoice, COOKIE_CHOICE_KEY } from '../src/lib/analytics-consent.ts';

test('consent withdrawal works with blocked storage and follows changes from another tab', () => {
  const original = globalThis.window;
  const browser = new EventTarget();
  let stored = 'analytics', blocked = true, notifications = 0;
  browser.localStorage = {
    getItem() { return stored; },
    setItem(_key, value) { if (blocked) throw new Error('Storage blocked'); stored = value; },
  };
  globalThis.window = browser;
  const unsubscribe = subscribeCookieChoice(() => notifications++);
  const storage = key => {
    const event = new Event('storage');
    Object.defineProperty(event, 'key', { value: key });
    browser.dispatchEvent(event);
  };
  try {
    assert.equal(readCookieChoice(), 'analytics');
    saveCookieChoice('essential');
    assert.equal(stored, 'analytics');
    assert.equal(readCookieChoice(), 'essential');
    assert.equal(notifications, 1);
    storage('unrelated');
    assert.equal(readCookieChoice(), 'essential');
    assert.equal(notifications, 1);
    storage(COOKIE_CHOICE_KEY);
    assert.equal(readCookieChoice(), 'analytics');
    blocked = false;
    saveCookieChoice('essential');
    assert.equal(stored, 'essential');
    stored = null;
    storage(null);
    assert.equal(readCookieChoice(), null);
    unsubscribe();
    const before = notifications;
    storage(COOKIE_CHOICE_KEY);
    assert.equal(notifications, before);
  } finally {
    unsubscribe();
    if (original === undefined) delete globalThis.window;
    else globalThis.window = original;
  }
});
