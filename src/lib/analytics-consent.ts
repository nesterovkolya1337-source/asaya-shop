export type CookieChoice = 'essential' | 'analytics';
export const COOKIE_CHOICE_KEY = 'asaya-cookie-choice-v1';
export const COOKIE_CHOICE_EVENT = 'asaya:cookie-choice';
export const COOKIE_SETTINGS_EVENT = 'asaya:cookie-settings';
let memoryChoice: CookieChoice | null = null;

export function readCookieChoice(): CookieChoice | null {
  if (typeof window === 'undefined') return null;
  if (memoryChoice) return memoryChoice;
  try {
    const saved = window.localStorage.getItem(COOKIE_CHOICE_KEY);
    if (saved === 'essential' || saved === 'analytics') return saved;
  } catch { /* The current tab's choice still works without storage. */ }
  return memoryChoice;
}

export function saveCookieChoice(choice: CookieChoice) {
  memoryChoice = choice;
  try { window.localStorage.setItem(COOKIE_CHOICE_KEY, choice); } catch { /* Keep the in-memory choice. */ }
  window.dispatchEvent(new Event(COOKIE_CHOICE_EVENT));
}

export function subscribeCookieChoice(listener: () => void) {
  const storage = (event: StorageEvent) => {
    if (event.key === COOKIE_CHOICE_KEY || event.key === null) {
      memoryChoice = null;
      listener();
    }
  };
  window.addEventListener(COOKIE_CHOICE_EVENT, listener);
  window.addEventListener('storage', storage);
  return () => {
    window.removeEventListener(COOKIE_CHOICE_EVENT, listener);
    window.removeEventListener('storage', storage);
  };
}
