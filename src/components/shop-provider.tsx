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
  resetProducts: () => void;
  setPromoCode: (code: string) => void;
  toggleFavorite: (id: string) => void;
  updateProduct: (id: string, updates: ProductAdminUpdate) => void;
};

const STORAGE_KEY = "asaya-shop-state-v1";
const ShopContext = createContext<ShopState | null>(null);

export type ProductAdminUpdate = Partial<Pick<Product, "price" | "oldPrice" | "discount" | "stock" | "active" | "badge">>;

type SavedShopState = Partial<Pick<ShopState, "cart" | "favorites" | "promoCode">> & {
  productOverrides?: Record<string, ProductAdminUpdate>;
};

export function ShopProvider({ children }: { children: React.ReactNode }) {
  const [products, setProducts] = useState(defaultProducts);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [favorites, setFavorites] = useState<string[]>([]);
  const [promoCode, setPromoCode] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let savedState: SavedShopState = {};
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        savedState = JSON.parse(saved) as SavedShopState;
      }
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }

    queueMicrotask(() => {
      if (savedState.cart) setCart(savedState.cart);
      if (Array.isArray(savedState.favorites)) setFavorites(savedState.favorites);
      if (savedState.promoCode === "ASAYA10") setPromoCode(savedState.promoCode);
      if (savedState.productOverrides) {
        setProducts(defaultProducts.map((product) => ({
          ...product,
          ...savedState.productOverrides?.[product.id],
        })));
      }
      setReady(true);
    });
  }, []);

  useEffect(() => {
    if (!ready) return;
    const productOverrides = Object.fromEntries(products.map((product) => [product.id, {
      price: product.price,
      oldPrice: product.oldPrice,
      discount: product.discount,
      stock: product.stock,
      active: product.active,
      badge: product.badge,
    }]));
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ cart, favorites, promoCode, productOverrides }));
  }, [cart, favorites, products, promoCode, ready]);

  const value = useMemo<ShopState>(() => ({
    products,
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
    resetProducts: () => setProducts(defaultProducts),
    setPromoCode,
    toggleFavorite: (id) => setFavorites((current) => current.includes(id)
      ? current.filter((favorite) => favorite !== id)
      : [...current, id]),
    updateProduct: (id, updates) => setProducts((current) => current.map((product) => (
      product.id === id ? { ...product, ...updates } : product
    ))),
  }), [cart, favorites, products, promoCode]);

  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;
}

export function useShop() {
  const context = useContext(ShopContext);
  if (!context) throw new Error("useShop must be used inside ShopProvider");
  return context;
}
