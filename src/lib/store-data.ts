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
  aroma: string;
  gallery: string[];
  sensory: Array<{ label: string; value: number }>;
  instruction: {
    steps: string[];
    amount: string;
    tip: string;
  };
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
    description: "Спрей защищает волосы от воздействия высоких температур до 230 °C, увлажняет и облегчает расчёсывание, делает волосы более мягкими, гладкими и послушными, помогает восстановить естественный блеск.",
    volume: "200 мл",
    features: ["Термозащита до 230 °C", "Гладкость и мягкость", "Для всех типов волос"],
    usage: "Встряхните флакон перед использованием. Распылите по длине на чистые и подсушенные полотенцем волосы с расстояния 15–20 см. Расчешите для равномерного распределения. Не смывая, приступите к укладке обычным или «кудрявым» методом.",
    ingredients: "Aqua, Bis-Cetearyl Amodimethicone, Ceteareth-7, Ceteareth-25, Myristyl Alcohol, Cetrimonium Chloride, Isopropyl Palmitate, Silicone Quaternium-18, Trideceth-3, Trideceth-9, Sodium Benzoate, Potassium Sorbate, Parfum, Citric Acid, Phenyl Trimethicone, Sodium PCA, Sodium Lactate, Arginine, Aspartic Acid, PCA, Alanine, Glycine, Serine, Valine, Isoleucine, Threonine, Proline, Histidine, Phenylalanine, Hydrolyzed Keratin, Prunus Persica Fruit Extract, Disodium EDTA, Polyquaternium-37.",
    aroma: "Сочный спелый персик и хрустящая карамель раскрываются нежным ванильным кремом и цветочными аккордами жасмина, переходящими в тёплые ноты мускуса, древесины и пралине.",
    gallery: [
      assetPath("/images/figma/product-spray.webp"),
      assetPath("/images/figma/asaya-6459.webp"),
      assetPath("/images/figma/ugc-000012160039.webp"),
      assetPath("/images/figma/asaya-6629.webp"),
    ],
    sensory: [
      { label: "Мягкость", value: 5 },
      { label: "Лёгкость расчёсывания", value: 5 },
      { label: "Невесомость", value: 4 },
    ],
    instruction: {
      steps: ["Встряхните флакон.", "Подсушите чистые волосы полотенцем.", "Распылите по длине с расстояния 15–20 см.", "Расчешите и приступайте к укладке, не смывая."],
      amount: "Нанесите лёгкой равномерной вуалью — волосы должны оставаться подвижными, без ощущения избытка средства.",
      tip: "Для кудрявого метода распределите спрей перед стайлингом и формированием завитка.",
    },
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
    description: "Крем для тела интенсивно увлажняет и питает кожу, помогает уменьшить ощущение сухости и стянутости, делает кожу более гладкой, мягкой и эластичной, быстро впитывается и не оставляет липкости.",
    volume: "300 мл",
    features: ["Интенсивное увлажнение", "Гладкость и шелковистость", "Для всех типов кожи"],
    usage: "Наносите на влажную кожу — так крем впитывается лучше и усиливает увлажнение. Распределите лёгкими массажными движениями от ступней вверх. Лёгкая текстура впитывается за 30–60 секунд, не оставляя следов.",
    ingredients: "Aqua, Ethylhexyl Stearate, Cocos Nucifera (Coconut) Oil, Dimethicone, Glyceryl Stearate, PEG-100 Stearate, Isononyl Isononanoate, Cetearyl Alcohol, Glycerin, Fully Refined Deodorized Edible Soybean Oil, Glyceryl Monostearate, Hydroxyethyl Urea, Hydrogenated Polyisobutene, Benzyl Alcohol, Ethylhexylglycerin, Tocopherol, Parfum, Acrylates/C10-30 Alkyl Acrylate Crosspolymer, Xanthan Gum, Euterpe Oleracea Fruit Extract, Vaccinium Macrocarpon Fruit Extract, Rubus Idaeus Fruit Extract, Camellia Oleifera Seed Oil, Squalane, Sodium Hydroxide, Persea Gratissima (Avocado) Oil.",
    aroma: "Свежий молодой кокос, нежный ванильный крем и жасмин раскрываются тёплыми нотами мускуса, древесины и пралине.",
    gallery: [
      assetPath("/images/figma/product-cream-coconut-page2.webp"),
      assetPath("/images/figma/ugc-img3456.webp"),
      assetPath("/images/figma/asaya-6139.webp"),
    ],
    sensory: [
      { label: "Комфорт", value: 5 },
      { label: "Питание", value: 4 },
      { label: "Скорость впитывания", value: 4 },
    ],
    instruction: {
      steps: ["Примите душ и слегка промокните кожу полотенцем.", "Нанесите крем на ещё влажную кожу.", "Распределите массажными движениями от ступней вверх.", "Дайте средству впитаться 30–60 секунд."],
      amount: "Начните с одного нажатия дозатора на каждую крупную зону и добавляйте средство при необходимости.",
      tip: "Особое внимание уделите участкам, где чаще появляется сухость: голеням, локтям и коленям.",
    },
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
    description: "Гель для душа мягко очищает кожу, поддерживает её естественное увлажнение, дарит ощущение свежести и комфорта, делает кожу мягкой и гладкой, не оставляя чувства сухости и стянутости.",
    volume: "500 мл",
    features: ["Увлажнение", "Мягкое очищение", "Для ежедневного использования"],
    usage: "Смочите тело тёплой водой, нанесите каплю геля и превратите её в воздушную пену. Распределите по коже и тщательно смойте водой.",
    ingredients: "Aqua, Sodium Laureth Sulfate, Cocamidopropyl Betaine, Sodium Chloride, Glycerin, Urea, Glyceryl Monostearate, Decyl Glucoside, Cocamide DEA, Parfum, Betaine, Lactic Acid, Euterpe Oleracea Fruit Extract, Persea Gratissima Avocado Oil, Sodium Hyaluronate, Sodium Ascorbyl Phosphate, Saccharomyces/Xylinum/Green Tea Ferment, Aloe Barbadensis Leaf Extract, Methylchloroisothiazolinone, Methylisothiazolinone, CI 42090, CI 19140.",
    aroma: "Хрустящая свежесть зелёного яблока и брызги лайма раскрываются сочным киви и нежными нотами тропических фруктов с прохладным послевкусием мятного листа.",
    gallery: [
      assetPath("/images/figma/product-gel-kiwi-page2.webp"),
      assetPath("/images/figma/ugc-img3456.webp"),
      assetPath("/images/figma/ugc-img5872.webp"),
    ],
    sensory: [
      { label: "Свежесть", value: 5 },
      { label: "Мягкость кожи", value: 4 },
      { label: "Интенсивность аромата", value: 4 },
    ],
    instruction: {
      steps: ["Смочите кожу тёплой водой.", "Нанесите небольшое количество геля на ладонь или мочалку.", "Вспеньте и мягко распределите по телу.", "Тщательно смойте водой."],
      amount: "Одного-двух нажатий дозатора обычно достаточно для одного применения.",
      tip: "После душа нанесите крем для тела на слегка влажную кожу, чтобы дополнить ритуал ухода.",
    },
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
