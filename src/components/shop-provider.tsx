"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { defaultProducts, type Product } from "@/lib/store-data";

type ShopState = {
  products: Product[];
  cart: Record<string, number>;
  favorites: string[];
  promoCode: string;
  userEmail: string | null;
  reviews: ProductReview[];
  cartCount: number;
  addToCart: (id: string) => void;
  addReview: (review: ReviewDraft) => void;
  changeQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
  login: (email: string) => void;
  logout: () => void;
  moderateReview: (id: string, status: ReviewStatus) => void;
  resetProducts: () => void;
  setPromoCode: (code: string) => void;
  toggleFavorite: (id: string) => void;
  updateProduct: (id: string, updates: ProductAdminUpdate) => void;
};

const STORAGE_KEY = "asaya-shop-state-v3";
const LEGACY_STORAGE_KEYS = ["asaya-shop-state-v2", "asaya-shop-state-v1"];
const ShopContext = createContext<ShopState | null>(null);

export type ReviewStatus = "pending" | "approved" | "rejected";

export type ProductReview = {
  id: string;
  productId: string;
  email: string;
  rating: number;
  text: string;
  photos: string[];
  createdAt: string;
  status: ReviewStatus;
};

export type ReviewDraft = Pick<ProductReview, "productId" | "email" | "rating" | "text" | "photos">;

export type ProductAdminUpdate = Partial<Pick<Product,
  | "name"
  | "description"
  | "volume"
  | "usage"
  | "ingredients"
  | "aroma"
  | "category"
  | "image"
  | "gallery"
  | "instruction"
  | "recommendations"
  | "price"
  | "oldPrice"
  | "discount"
  | "stock"
  | "active"
  | "badge"
>>;

type SavedShopState = Partial<Pick<ShopState, "cart" | "favorites" | "promoCode" | "userEmail" | "reviews">> & {
  productOverrides?: Record<string, ProductAdminUpdate>;
};

export function ShopProvider({ children }: { children: React.ReactNode }) {
  const [products, setProducts] = useState(defaultProducts);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [favorites, setFavorites] = useState<string[]>([]);
  const [promoCode, setPromoCode] = useState("");
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let savedState: SavedShopState = {};
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        savedState = JSON.parse(saved) as SavedShopState;
      } else {
        const legacy = LEGACY_STORAGE_KEYS
          .map((key) => window.localStorage.getItem(key))
          .find(Boolean);
        if (legacy) savedState = JSON.parse(legacy) as SavedShopState;
      }
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }

    queueMicrotask(() => {
      if (savedState.cart) setCart(savedState.cart);
      if (Array.isArray(savedState.favorites)) setFavorites(savedState.favorites);
      if (savedState.promoCode === "ASAYA10") setPromoCode(savedState.promoCode);
      if (typeof savedState.userEmail === "string") setUserEmail(savedState.userEmail);
      if (Array.isArray(savedState.reviews)) setReviews(savedState.reviews);
      if (savedState.productOverrides) {
        setProducts(defaultProducts.map((product) => {
          const savedProduct = savedState.productOverrides?.[product.id];
          if (!savedProduct) return product;
          const updates = { ...savedProduct };
          if (!Array.isArray(updates.gallery) || updates.gallery.length < 4) delete updates.gallery;
          return { ...product, ...updates };
        }));
      }
      setReady(true);
    });
  }, []);

  useEffect(() => {
    if (!ready) return;
    const productOverrides = Object.fromEntries(products.map((product) => [product.id, {
      name: product.name,
      description: product.description,
      volume: product.volume,
      usage: product.usage,
      ingredients: product.ingredients,
      aroma: product.aroma,
      category: product.category,
      image: product.image,
      gallery: product.gallery,
      instruction: product.instruction,
      recommendations: product.recommendations,
      price: product.price,
      oldPrice: product.oldPrice,
      discount: product.discount,
      stock: product.stock,
      active: product.active,
      badge: product.badge,
    }]));
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ cart, favorites, promoCode, productOverrides, reviews, userEmail }));
  }, [cart, favorites, products, promoCode, ready, reviews, userEmail]);

  const productsWithReviews = useMemo(() => products.map((product) => {
    const approved = reviews.filter((review) => review.productId === product.id && review.status === "approved");
    if (!approved.length) return { ...product, reviews: 0, rating: 5 };
    const rating = approved.reduce((sum, review) => sum + review.rating, 0) / approved.length;
    return { ...product, reviews: approved.length, rating };
  }), [products, reviews]);

  const value = useMemo<ShopState>(() => ({
    products: productsWithReviews,
    cart,
    favorites,
    promoCode,
    userEmail,
    reviews,
    cartCount: Object.values(cart).reduce((sum, quantity) => sum + quantity, 0),
    addToCart: (id) => setCart((current) => ({ ...current, [id]: (current[id] ?? 0) + 1 })),
    addReview: (review) => setReviews((current) => [{
      ...review,
      id: `review-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      status: "pending",
    }, ...current]),
    changeQuantity: (id, quantity) => setCart((current) => {
      const next = { ...current };
      if (quantity <= 0) delete next[id];
      else next[id] = quantity;
      return next;
    }),
    clearCart: () => { setCart({}); setPromoCode(""); },
    login: (email) => setUserEmail(email.trim().toLocaleLowerCase("ru")),
    logout: () => setUserEmail(null),
    moderateReview: (id, status) => setReviews((current) => current.map((review) => review.id === id ? { ...review, status } : review)),
    resetProducts: () => setProducts(defaultProducts),
    setPromoCode,
    toggleFavorite: (id) => setFavorites((current) => current.includes(id)
      ? current.filter((favorite) => favorite !== id)
      : [...current, id]),
    updateProduct: (id, updates) => setProducts((current) => current.map((product) => (
      product.id === id ? { ...product, ...updates } : product
    ))),
  }), [cart, favorites, productsWithReviews, promoCode, reviews, userEmail]);

  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;
}

export function useShop() {
  const context = useContext(ShopContext);
  if (!context) throw new Error("useShop must be used inside ShopProvider");
  return context;
}
