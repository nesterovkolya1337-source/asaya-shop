import { assetPath } from "@/lib/asset-path";

export type ProductCategory = "hair" | "body" | "face" | "sets";

export type Product = {
  id: string;
  name: string;
  description: string;
  category: ProductCategory;
  price: number;
  oldPrice: number;
  discount: number;
  badge: string;
  image: string;
  rating: number;
  reviews: number;
  stock: number;
  active: boolean;
};

export const categoryLabels: Record<ProductCategory, string> = {
  hair: "Волосы",
  body: "Тело",
  face: "Лицо",
  sets: "Наборы",
};

export const defaultProducts: Product[] = [
  {
    id: "multi-hair-spray",
    name: "Мульти спрей для волос",
    description: "Несмываемый уход, лёгкое расчёсывание и защита волос в одном флаконе.",
    category: "hair",
    price: 500,
    oldPrice: 700,
    discount: 20,
    badge: "Бестселлер",
    image: assetPath("/images/figma/product-spray.webp"),
    rating: 5,
    reviews: 123,
    stock: 24,
    active: true,
  },
  {
    id: "coconut-body-cream",
    name: "Увлажняющий крем для тела с кокосом",
    description: "Питательный крем с мягким ароматом кокоса для гладкости и комфорта кожи.",
    category: "body",
    price: 500,
    oldPrice: 700,
    discount: 20,
    badge: "Новинка",
    image: assetPath("/images/figma/product-cream-coconut.webp"),
    rating: 5,
    reviews: 86,
    stock: 18,
    active: true,
  },
  {
    id: "pink-shower-gel",
    name: "Гель для душа",
    description: "Деликатное очищение и яркий аромат для ежедневного ритуала ухода.",
    category: "body",
    price: 500,
    oldPrice: 700,
    discount: 20,
    badge: "Бестселлер",
    image: assetPath("/images/figma/product-gel-pink.webp"),
    rating: 5,
    reviews: 74,
    stock: 31,
    active: true,
  },
];

export function formatPrice(value: number) {
  return `${new Intl.NumberFormat("ru-RU").format(value)} ₽`;
}
