import { assetPath } from "@/lib/asset-path";

export type ProductCategory = "hair" | "body" | "face" | "sets";

export type Product = {
  id: string;
  name: string;
  description: string;
  volume: string;
  features: string[];
  usage: string;
  ingredients: string;
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
    volume: "200 мл",
    features: ["Облегчает расчёсывание", "Снижает пушистость", "Подходит для ежедневного ухода"],
    usage: "Распылите на чистые влажные или сухие волосы по длине, избегая корней. Не смывайте.",
    ingredients: "Ухаживающий комплекс, увлажняющие компоненты и лёгкая парфюмерная композиция.",
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
    volume: "300 мл",
    features: ["Смягчает кожу", "Поддерживает увлажнение", "Быстро впитывается"],
    usage: "Нанесите на чистую сухую кожу массажными движениями. Используйте ежедневно.",
    ingredients: "Увлажняющий комплекс, смягчающие компоненты и аромат кокоса.",
    category: "body",
    price: 500,
    oldPrice: 700,
    discount: 20,
    badge: "Новинка",
    image: assetPath("/images/figma/product-cream-coconut-page2.webp"),
    rating: 5,
    reviews: 86,
    stock: 18,
    active: true,
  },
  {
    id: "kiwi-shower-gel",
    name: "Гель для душа с киви",
    description: "Деликатное очищение и свежий аромат киви для ежедневного ритуала ухода.",
    volume: "500 мл",
    features: ["Мягко очищает", "Не сушит кожу", "Оставляет свежий аромат"],
    usage: "Нанесите небольшое количество на влажную кожу, вспеньте и тщательно смойте водой.",
    ingredients: "Мягкая очищающая основа, увлажняющие компоненты и аромат киви.",
    category: "body",
    price: 500,
    oldPrice: 700,
    discount: 20,
    badge: "Бестселлер",
    image: assetPath("/images/figma/product-gel-kiwi-page2.webp"),
    rating: 5,
    reviews: 74,
    stock: 31,
    active: true,
  },
];

export function formatPrice(value: number) {
  return `${new Intl.NumberFormat("ru-RU").format(value)} ₽`;
}
