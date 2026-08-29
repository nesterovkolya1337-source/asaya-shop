"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { defaultProducts, type Product } from "@/lib/store-data";

type Profile = {
  name: string;
  email: string;
  phone: string;
};

type ShopState = {
  products: Product[];
  cart: Record<string, number>;
  favorites: string[];
  profile: Profile;
  cartCount: number;
  addToCart: (id: string) => void;
  changeQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
  toggleFavorite: (id: string) => void;
  updateProduct: (id: string, updates: Partial<Product>) => void;
  moveProduct: (id: string, direction: -1 | 1) => void;
  resetProducts: () => void;
  saveProfile: (profile: Profile) => void;
};

const STORAGE_KEY = "asaya-shop-state-v1";
const ShopContext = createContext<ShopState | null>(null);

export function ShopProvider({ children }: { children: React.ReactNode }) {
  const [products, setProducts] = useState(defaultProducts);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [favorites, setFavorites] = useState<string[]>([]);
  const [profile, setProfile] = useState<Profile>({ name: "", email: "", phone: "" });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let savedState: Partial<Pick<ShopState, "products" | "cart" | "favorites" | "profile">> = {};
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        savedState = JSON.parse(saved) as Partial<Pick<ShopState, "products" | "cart" | "favorites" | "profile">>;
      }
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }

    queueMicrotask(() => {
      if (Array.isArray(savedState.products)) setProducts(savedState.products);
      if (savedState.cart) setCart(savedState.cart);
      if (Array.isArray(savedState.favorites)) setFavorites(savedState.favorites);
      if (savedState.profile) setProfile(savedState.profile);
      setReady(true);
    });
  }, []);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ products, cart, favorites, profile }));
  }, [cart, favorites, products, profile, ready]);

  const value = useMemo<ShopState>(() => ({
    products,
    cart,
    favorites,
    profile,
    cartCount: Object.values(cart).reduce((sum, quantity) => sum + quantity, 0),
    addToCart: (id) => setCart((current) => ({ ...current, [id]: (current[id] ?? 0) + 1 })),
    changeQuantity: (id, quantity) => setCart((current) => {
      const next = { ...current };
      if (quantity <= 0) delete next[id];
      else next[id] = quantity;
      return next;
    }),
    clearCart: () => setCart({}),
    toggleFavorite: (id) => setFavorites((current) => current.includes(id)
      ? current.filter((favorite) => favorite !== id)
      : [...current, id]),
    updateProduct: (id, updates) => setProducts((current) => current.map((product) => (
      product.id === id ? { ...product, ...updates } : product
    ))),
    moveProduct: (id, direction) => setProducts((current) => {
      const from = current.findIndex((product) => product.id === id);
      const to = from + direction;
      if (from < 0 || to < 0 || to >= current.length) return current;
      const next = [...current];
      [next[from], next[to]] = [next[to], next[from]];
      return next;
    }),
    resetProducts: () => setProducts(defaultProducts),
    saveProfile: setProfile,
  }), [cart, favorites, products, profile]);

  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;
}

export function useShop() {
  const context = useContext(ShopContext);
  if (!context) throw new Error("useShop must be used inside ShopProvider");
  return context;
}
