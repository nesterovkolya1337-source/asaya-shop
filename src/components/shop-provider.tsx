"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { defaultProducts, type Product } from "@/lib/store-data";

type ShopState = {
  products: Product[];
  cart: Record<string, number>;
  favorites: string[];
  promoCode: string;
  cartCount: number;
  addToCart: (id: string) => void;
  changeQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
  setPromoCode: (code: string) => void;
  toggleFavorite: (id: string) => void;
};

const STORAGE_KEY = "asaya-shop-state-v1";
const ShopContext = createContext<ShopState | null>(null);

export function ShopProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<Record<string, number>>({});
  const [favorites, setFavorites] = useState<string[]>([]);
  const [promoCode, setPromoCode] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let savedState: Partial<Pick<ShopState, "cart" | "favorites" | "promoCode">> = {};
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        savedState = JSON.parse(saved) as Partial<Pick<ShopState, "cart" | "favorites" | "promoCode">>;
      }
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }

    queueMicrotask(() => {
      if (savedState.cart) setCart(savedState.cart);
      if (Array.isArray(savedState.favorites)) setFavorites(savedState.favorites);
      if (savedState.promoCode === "ASAYA10") setPromoCode(savedState.promoCode);
      setReady(true);
    });
  }, []);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ cart, favorites, promoCode }));
  }, [cart, favorites, promoCode, ready]);

  const value = useMemo<ShopState>(() => ({
    products: defaultProducts,
    cart,
    favorites,
    promoCode,
    cartCount: Object.values(cart).reduce((sum, quantity) => sum + quantity, 0),
    addToCart: (id) => setCart((current) => ({ ...current, [id]: (current[id] ?? 0) + 1 })),
    changeQuantity: (id, quantity) => setCart((current) => {
      const next = { ...current };
      if (quantity <= 0) delete next[id];
      else next[id] = quantity;
      return next;
    }),
    clearCart: () => { setCart({}); setPromoCode(""); },
    setPromoCode,
    toggleFavorite: (id) => setFavorites((current) => current.includes(id)
      ? current.filter((favorite) => favorite !== id)
      : [...current, id]),
  }), [cart, favorites, promoCode]);

  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;
}

export function useShop() {
  const context = useContext(ShopContext);
  if (!context) throw new Error("useShop must be used inside ShopProvider");
  return context;
}
