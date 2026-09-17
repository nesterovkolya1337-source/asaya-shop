"use client";

import {getProductAnalytics} from '@/lib/product-analytics';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { getMetrika } from '@/lib/metrika';
import { defaultProducts, type Product } from "@/lib/store-data";
import { readBackendCatalog } from "@/lib/backend-catalog";
import { assetPath } from "@/lib/asset-path";
import {repeatOrderPlan} from '@/lib/repeat-order';

type ShopState = {
  yandexCheckoutEnabled: boolean;
  checkoutEnabled: boolean;
  catalogOnly: boolean;
  catalogStatus: "demo" | "loading" | "ready" | "error";
  reloadCatalog: () => void;
  repeatOrder: (lines:Array<{sku:string;name_snapshot:string;quantity:number}>,signal:AbortSignal)=>Promise<{added:number;skipped:string[]}>;
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
// Demo data is an explicit local preview option, never the default storefront.
const CATALOG_ONLY = process.env.NEXT_PUBLIC_CATALOG_SOURCE !== "demo";
const YANDEX_CHECKOUT_ENABLED = CATALOG_ONLY && process.env.NEXT_PUBLIC_YANDEX_BUTTON === 'true';
const CHECKOUT_ENABLED = CATALOG_ONLY && (YANDEX_CHECKOUT_ENABLED || process.env.NEXT_PUBLIC_TEST_CHECKOUT === 'true');
const CART_KEY='asaya-backend-cart-v1';
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
  const [products, setProducts] = useState<Product[]>(CATALOG_ONLY ? [] : defaultProducts);
  const [catalogStatus, setCatalogStatus] = useState<ShopState["catalogStatus"]>(CATALOG_ONLY ? "loading" : "demo");
  const [catalogAttempt, setCatalogAttempt] = useState(0);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [favorites, setFavorites] = useState<string[]>([]);
  const [promoCode, setPromoCode] = useState("");
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [ready, setReady] = useState(false);
  const [cartReady,setCartReady]=useState(false);
  const analyticsCart = useRef<Record<string, number> | null>(null);

  useEffect(()=>{
    if(!CHECKOUT_ENABLED)return;
    let saved:Record<string,number>={};
    try {
      const raw:unknown=JSON.parse(sessionStorage.getItem(CART_KEY)??'{}');
      if(raw&&typeof raw==='object'&&!Array.isArray(raw)) saved=Object.fromEntries(Object.entries(raw).filter(([id,n])=>
        /^[a-z0-9][a-z0-9-]{0,79}$/.test(id)&&Number.isInteger(n)&&n>0&&n<=100).slice(0,50));
    } catch { /* Invalid saved carts start empty. */ }
    queueMicrotask(()=>{setCart(saved);setCartReady(true);});
  },[]);
  useEffect(()=>{if(CHECKOUT_ENABLED&&cartReady){try{sessionStorage.setItem(CART_KEY,JSON.stringify(cart));}catch{/* In-memory cart still works. */}}},[cart,cartReady]);

  useEffect(() => {
    if (CATALOG_ONLY) return;
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
    if (!CATALOG_ONLY) return;
    const controller = new AbortController();
    let disposed = false;
    const timeout = setTimeout(() => controller.abort(), 8000);
    fetch(assetPath('/api/store/v1/products'), { signal: controller.signal, cache: 'no-store', credentials: 'omit' })
      .then(async response => {
        if (!response.ok) throw new Error('CATALOG_UNAVAILABLE');
        return readBackendCatalog(await response.json());
      })
      .then(items => { if (!disposed) { setProducts(items); setCatalogStatus('ready'); } })
      .catch(() => { if (!disposed) { setProducts([]); setCatalogStatus('error'); } })
      .finally(() => clearTimeout(timeout));
    return () => { disposed = true; clearTimeout(timeout); controller.abort(); };
  }, [catalogAttempt]);

  useEffect(() => {
    if (!ready || CATALOG_ONLY) return;
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

  const productsWithReviews = useMemo(() => CATALOG_ONLY ? products : products.map((product) => {
    const approved = reviews.filter((review) => review.productId === product.id && review.status === "approved");
    if (!approved.length) return { ...product, reviews: 0, rating: 5 };
    const rating = approved.reduce((sum, review) => sum + review.rating, 0) / approved.length;
    return { ...product, reviews: approved.length, rating };
  }), [products, reviews]);

  useEffect(() => {
    if (!CATALOG_ONLY || !cartReady || catalogStatus !== 'ready') return;
    const before = analyticsCart.current;
    analyticsCart.current = cart;
    // Hydration/restoration establishes a baseline, not an add-to-cart event.
    if (before) {getMetrika()?.cartChanged(before, cart, productsWithReviews);for(const [id,quantity] of Object.entries(cart))if(quantity>(before[id]??0))getProductAnalytics()?.track('add_to_cart',productsWithReviews.find(p=>p.id===id)?.sku);}
  }, [cart, cartReady, catalogStatus, productsWithReviews]);

  const value = useMemo<ShopState>(() => ({
    checkoutEnabled: CHECKOUT_ENABLED,
    yandexCheckoutEnabled: YANDEX_CHECKOUT_ENABLED,
    catalogOnly: CATALOG_ONLY,
    catalogStatus,
    reloadCatalog: () => { setProducts([]); setCatalogStatus('loading'); setCatalogAttempt(current => current + 1); },
    repeatOrder: async (lines,signal)=>{
      if(!CHECKOUT_ENABLED)throw Error('Оформление заказов пока недоступно.');
      const response=await fetch(assetPath('/api/store/v1/products'),{cache:'no-store',credentials:'omit',signal:AbortSignal.any([signal,AbortSignal.timeout(8000)])});
      if(!response.ok)throw Error('Не удалось проверить актуальные цены и остатки. Повторите позже.');
      const fresh=readBackendCatalog(await response.json()),result=repeatOrderPlan(lines,fresh,cart);
      signal.throwIfAborted();
      setProducts(fresh);setCatalogStatus('ready');setCart(current=>repeatOrderPlan(lines,fresh,current).cart);
      return {added:result.added,skipped:result.skipped};
    },
    products: productsWithReviews,
    cart,
    favorites,
    promoCode,
    userEmail,
    reviews,
    cartCount: Object.values(cart).reduce((sum, quantity) => sum + quantity, 0),
    addToCart: (id) => { if (!CATALOG_ONLY || CHECKOUT_ENABLED) setCart((current) => {
      const product=productsWithReviews.find(item=>item.id===id);
      if(!product?.active||product.stock<1)return current;
      return {...current,[id]:Math.min((current[id]??0)+1,product.stock,100)};
    }); },
    addReview: (review) => { if (!CATALOG_ONLY) setReviews((current) => [{
      ...review,
      id: `review-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      status: "pending",
    }, ...current]); },
    changeQuantity: (id, quantity) => setCart((current) => {
      const next = { ...current };
      if (quantity <= 0) delete next[id];
      else {const product=productsWithReviews.find(item=>item.id===id);if(product?.active&&Number.isInteger(quantity))next[id]=Math.min(quantity,product.stock,100);}
      return next;
    }),
    clearCart: () => { setCart({}); setPromoCode(""); },
    login: (email) => { if (!CATALOG_ONLY) setUserEmail(email.trim().toLocaleLowerCase("ru")); },
    logout: () => setUserEmail(null),
    moderateReview: (id, status) => setReviews((current) => current.map((review) => review.id === id ? { ...review, status } : review)),
    resetProducts: () => { if (!CATALOG_ONLY) setProducts(defaultProducts); },
    setPromoCode,
    toggleFavorite: (id) => setFavorites((current) => current.includes(id)
      ? current.filter((favorite) => favorite !== id)
      : [...current, id]),
    updateProduct: (id, updates) => { if (!CATALOG_ONLY) setProducts((current) => current.map((product) => (
      product.id === id ? { ...product, ...updates } : product
    ))); },
  }), [cart, favorites, productsWithReviews, promoCode, reviews, userEmail, catalogStatus]);

  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;
}

export function useShop() {
  const context = useContext(ShopContext);
  if (!context) throw new Error("useShop must be used inside ShopProvider");
  return context;
}
