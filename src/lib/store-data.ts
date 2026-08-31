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

const hairAroma = "Сочный морской аккорд, чёрная смородина и груша раскрываются цветочным букетом жасмина и розы, оставляя мягкий шлейф ванили, белого кедра и мускуса.";
const bodyCreamDescription = "Крем для тела интенсивно увлажняет и питает кожу, помогает уменьшить ощущение сухости и стянутости, делает кожу более гладкой, мягкой и эластичной, быстро впитывается и не оставляет липкости.";
const bodyCreamUsage = "Наносите на влажную кожу — так крем впитывается лучше и усиливает увлажнение. Распределите лёгкими массажными движениями от ступней вверх. Лёгкая текстура впитывается за 30–60 секунд, не оставляя следов.";
const bodyCreamIngredients = "Aqua, Ethylhexyl Stearate, Cocos Nucifera (Coconut) Oil, Dimethicone, Glyceryl Stearate, PEG-100 Stearate, Isononyl Isononanoate, Cetearyl Alcohol, Glycerin, Fully Refined Deodorized Edible Soybean Oil, Glyceryl Monostearate, Hydroxyethyl Urea, Hydrogenated Polyisobutene, Benzyl Alcohol, Ethylhexylglycerin, Tocopherol, Parfum, Acrylates/C10-30 Alkyl Acrylate Crosspolymer, Xanthan Gum, Euterpe Oleracea Fruit Extract, Vaccinium Macrocarpon Fruit Extract, Rubus Idaeus Fruit Extract, Camellia Oleifera Seed Oil, Squalane, Sodium Hydroxide, Persea Gratissima (Avocado) Oil.";
const gelDescription = "Гель для душа мягко очищает кожу, поддерживает её естественное увлажнение, дарит ощущение свежести и комфорта, делает кожу мягкой и гладкой, не оставляя чувства сухости и стянутости.";
const gelUsage = "Смочите тело тёплой водой, нанесите каплю геля и превратите её в воздушную пену. Мягко распределите по коже и тщательно смойте водой.";
const gelIngredients = "Aqua, Sodium Laureth Sulfate, Cocamidopropyl Betaine, Sodium Chloride, Glycerin, Urea, Glyceryl Monostearate, Decyl Glucoside, Cocamide DEA, Parfum, Betaine, Lactic Acid, Euterpe Oleracea Fruit Extract, Persea Gratissima Avocado Oil, Sodium Hyaluronate, Sodium Ascorbyl Phosphate, Saccharomyces/Xylinum/Green Tea Ferment, Aloe Barbadensis Leaf Extract, Methylchloroisothiazolinone, Methylisothiazolinone";
const gelFeatures = ["Увлажнение", "Мягкое очищение", "Для ежедневного использования"];
const bodyInstruction = {
  steps: ["Примите душ и слегка промокните кожу полотенцем.", "Нанесите крем на ещё влажную кожу.", "Распределите массажными движениями от ступней вверх.", "Дайте средству впитаться 30–60 секунд."],
  amount: "Начните с одного нажатия дозатора на каждую крупную зону и добавляйте средство при необходимости.",
  tip: "Особое внимание уделите участкам, где чаще появляется сухость: голеням, локтям и коленям.",
};
const gelInstruction = {
  steps: ["Смочите кожу тёплой водой.", "Нанесите небольшое количество геля на ладонь или мочалку.", "Вспеньте и мягко распределите по телу.", "Тщательно смойте водой."],
  amount: "Одного-двух нажатий дозатора обычно достаточно для одного применения.",
  tip: "После душа нанесите крем для тела на слегка влажную кожу, чтобы дополнить ритуал ухода.",
};

type ProductDraft = Omit<Product, "gallery" | "sensory" | "price" | "oldPrice" | "discount" | "badge" | "rating" | "reviews" | "stock" | "active"> & Partial<Pick<Product, "gallery" | "sensory" | "price" | "oldPrice" | "discount" | "badge" | "rating" | "reviews" | "stock" | "active">>;

function createProduct(draft: ProductDraft): Product {
  return {
    price: 500,
    oldPrice: 700,
    discount: 20,
    badge: "",
    rating: 5,
    reviews: 0,
    stock: 20,
    active: true,
    gallery: [draft.image],
    sensory: draft.features.map((label, index) => ({ label, value: index === 2 ? 4 : 5 })),
    ...draft,
  };
}

export const defaultProducts: Product[] = [
  createProduct({
    id: "avocado-body-cream",
    name: "Питательный крем для тела с авокадо",
    description: bodyCreamDescription,
    volume: "300 мл",
    features: ["Питание и увлажнение", "Гладкость и шелковистость", "Для всех типов кожи"],
    usage: bodyCreamUsage,
    ingredients: bodyCreamIngredients,
    aroma: "Брызги сочного свежеразрезанного киви и шелковистая мякоть тропических фруктов раскрываются энергичным аккордом яркого цитруса.",
    instruction: bodyInstruction,
    category: "body",
    badge: "Новинка",
    image: assetPath("/images/figma/catalog-products/body-avocado.webp"),
  }),
  createProduct({
    id: "multi-hair-spray",
    name: "Мульти спрей для волос",
    description: "Спрей защищает волосы от воздействия высоких температур до 230 °C, увлажняет и облегчает расчёсывание, делает волосы более мягкими, гладкими и послушными, помогает восстановить естественный блеск.",
    volume: "200 мл",
    features: ["Термозащита до 230 °C", "Гладкость и мягкость", "Для всех типов волос"],
    usage: "Встряхните флакон перед использованием. Распылите по длине на чистые и подсушенные полотенцем волосы с расстояния 15–20 см. Расчешите для равномерного распределения. Не смывая, приступите к укладке.",
    ingredients: "Aqua, Bis-Cetearyl Amodimethicone, Ceteareth-7, Ceteareth-25, Myristyl Alcohol, Cetrimonium Chloride, Isopropyl Palmitate, Silicone Quaternium-18, Trideceth-3, Trideceth-9, Sodium Benzoate, Potassium Sorbate, Parfum, Citric Acid, Phenyl Trimethicone, Sodium PCA, Sodium Lactate, Arginine, Aspartic Acid, PCA, Alanine, Glycine, Serine, Valine, Isoleucine, Threonine, Proline, Histidine, Phenylalanine, Hydrolyzed Keratin, Prunus Persica Fruit Extract, Disodium EDTA, Polyquaternium-37.",
    aroma: "Сочный спелый персик и хрустящая карамель раскрываются нежным ванильным кремом и цветочными аккордами жасмина, переходящими в тёплые ноты мускуса, древесины и пралине.",
    instruction: {
      steps: ["Встряхните флакон.", "Подсушите чистые волосы полотенцем.", "Распылите по длине с расстояния 15–20 см.", "Расчешите и приступайте к укладке, не смывая."],
      amount: "Нанесите лёгкой равномерной вуалью, не перенасыщая волосы средством.",
      tip: "Для кудрявого метода распределите спрей перед стайлингом и формированием завитка.",
    },
    category: "hair",
    badge: "Бестселлер",
    image: assetPath("/images/figma/product-spray.webp"),
  }),
  createProduct({
    id: "strawberry-shower-gel",
    name: "Гель для душа «Клубничный йогурт»",
    description: gelDescription,
    volume: "500 мл",
    features: gelFeatures,
    usage: gelUsage,
    ingredients: `${gelIngredients}, CI 14720.`,
    aroma: "Сладкая сахарная вата и спелая лесная клубника раскрываются нежным розовым зефиром с карамельной корочкой и уютными нотами томлёной ванили.",
    instruction: gelInstruction,
    category: "body",
    badge: "Бестселлер",
    discount: 10,
    image: assetPath("/images/figma/catalog-products/gel-strawberry.webp"),
  }),
  createProduct({
    id: "coconut-body-cream",
    name: "Увлажняющий крем для тела с кокосом",
    description: bodyCreamDescription,
    volume: "300 мл",
    features: ["Интенсивное увлажнение", "Гладкость и шелковистость", "Для всех типов кожи"],
    usage: bodyCreamUsage,
    ingredients: bodyCreamIngredients,
    aroma: "Свежий молодой кокос, нежный ванильный крем и жасмин раскрываются тёплыми нотами мускуса, древесины и пралине.",
    instruction: bodyInstruction,
    category: "body",
    badge: "Бестселлер",
    discount: 10,
    image: assetPath("/images/figma/product-cream-coconut-page2.webp"),
  }),
  createProduct({
    id: "hair-balm",
    name: "Бальзам для волос",
    description: "Бальзам увлажняет и питает волосы, разглаживает их и облегчает расчёсывание, делает более гладкими, плотными и шелковистыми, помогает восстановить естественный блеск и создаёт эффект ламинирования.",
    volume: "300 мл",
    features: ["Увлажнение и питание", "Лёгкое расчёсывание", "Для всех типов волос"],
    usage: "Нанесите на чистые влажные волосы по длине, избегая зоны у корней. Уделите внимание кончикам, оставьте на 1–2 минуты и тщательно смойте прохладной водой.",
    ingredients: "Aqua, Cetearyl Alcohol, Behentrimonium Methosulfate, Cetrimonium Chloride, Glycerin, Cocos Nucifera (Coconut) Oil, Citric Acid, Parfum, Benzyl Alcohol, Methylchloroisothiazolinone, Methylisothiazolinone, Hydrolyzed Keratin, Euterpe Oleracea Fruit Powder, Disodium EDTA, Rubus Idaeus Fruit Extract, Rosmarinus Officinalis Leaf Extract.",
    aroma: hairAroma,
    instruction: {
      steps: ["Вымойте волосы шампунем.", "Отожмите лишнюю воду.", "Распределите бальзам по длине, отступая от корней.", "Оставьте на 1–2 минуты и тщательно смойте."],
      amount: "Для волос до плеч начните с порции размером с небольшую монету.",
      tip: "Для более гладкого результата завершите смывание прохладной водой.",
    },
    category: "hair",
    badge: "Бестселлер",
    discount: 10,
    image: assetPath("/images/figma/catalog-products/hair-balm.webp"),
  }),
  createProduct({
    id: "restoring-face-cream",
    name: "Восстанавливающий крем для лица",
    description: "Ежедневный крем для комфортного ухода за кожей лица с ниацинамидом 2% и пептидами.",
    volume: "50 мл",
    features: ["Ежедневный уход", "Комфортная текстура", "Для лица и шеи"],
    usage: "Нанесите небольшое количество крема на очищенную кожу лица и шеи, избегая области вокруг глаз. Используйте утром и/или вечером.",
    ingredients: "Полный состав будет добавлен после получения официальной карточки продукта. До публикации сверяйте INCI на упаковке.",
    aroma: "Информация об аромате будет добавлена после получения официальной карточки продукта.",
    instruction: {
      steps: ["Очистите и промокните кожу.", "Нанесите порцию крема размером с горошину.", "Распределите по лицу и шее, избегая области вокруг глаз.", "Днём завершите уход средством с SPF."],
      amount: "Порции размером с горошину достаточно для лица; для шеи добавьте ещё немного.",
      tip: "При чувствительной коже сначала протестируйте средство на небольшом участке.",
    },
    category: "face",
    badge: "Новинка",
    discount: 0,
    oldPrice: 500,
    image: assetPath("/images/figma/catalog-products/face-restoring.webp"),
  }),
  createProduct({
    id: "hair-shampoo",
    name: "Шампунь для волос",
    description: "Шампунь мягко и эффективно очищает волосы и кожу головы, помогает поддерживать оптимальный уровень увлажнения, делает волосы более гладкими, плотными и сияющими, не пересушивая кожу головы.",
    volume: "300 мл",
    features: ["Увлажнение", "Гладкость и плотность", "Для всех типов волос"],
    usage: "Нанесите небольшое количество на влажные волосы и кожу головы, мягко помассируйте до образования пены и тщательно смойте. При необходимости повторите.",
    ingredients: "Aqua, Sodium Laureth Sulfate, Cocamidopropyl Betaine, Sodium Chloride, Cocamide DEA, Polyquaternium-7, Glycerin, Disodium Lauryl Sulfosuccinate, Coco-Glucoside, Parfum, Hydrolyzed Keratin, Euterpe Oleracea Fruit Powder, Citric Acid, Methylchloroisothiazolinone, Methylisothiazolinone, Mangifera Indica Fruit Extract, Disodium EDTA.",
    aroma: hairAroma,
    instruction: {
      steps: ["Полностью намочите волосы тёплой водой.", "Вспеньте шампунь в ладонях и нанесите на кожу головы.", "Мягко массируйте 1–2 минуты.", "Тщательно смойте и при необходимости повторите."],
      amount: "Начните с порции размером с небольшую монету и добавьте при необходимости.",
      tip: "Основное внимание уделяйте коже головы; длине обычно достаточно стекающей пены.",
    },
    category: "hair",
    badge: "Бестселлер",
    discount: 10,
    image: assetPath("/images/figma/catalog-products/hair-shampoo.webp"),
  }),
  createProduct({
    id: "kiwi-shower-gel",
    name: "Гель для душа «Киви»",
    description: gelDescription,
    volume: "500 мл",
    features: gelFeatures,
    usage: gelUsage,
    ingredients: `${gelIngredients}, CI 42090, CI 19140.`,
    aroma: "Хрустящая свежесть зелёного яблока и брызги лайма раскрываются сочным киви и нежными нотами тропических фруктов с прохладным послевкусием мятного листа.",
    instruction: gelInstruction,
    category: "body",
    badge: "Бестселлер",
    image: assetPath("/images/figma/product-gel-kiwi-page2.webp"),
  }),
  createProduct({
    id: "hair-mask",
    name: "Маска для волос",
    description: "Маска интенсивно восстанавливает и питает ослабленные, вьющиеся и окрашенные волосы, помогает сделать их более плотными, гладкими и сильными, уменьшает пушистость и спутывание, не утяжеляя волосы.",
    volume: "300 мл",
    features: ["Восстановление и питание", "Гладкость и плотность", "Для ослабленных и окрашенных волос"],
    usage: "Нанесите на чистые влажные волосы от середины длины до кончиков, избегая корней. Для равномерного распределения используйте гребень. Оставьте на 5–7 минут и тщательно смойте.",
    ingredients: "Aqua, Behentrimonium Chloride, Cetearyl Alcohol, Bis-Cetearyl Amodimethicone, Ceteareth-7, Ceteareth-25, Sodium Benzoate, Potassium Sorbate, PPG-3 Caprylyl Ether, Parfum, Citric Acid, Sodium PCA, Sodium Lactate, Arginine, Aspartic Acid, PCA, Alanine, Glycine, Serine, Valine, Isoleucine, Threonine, Proline, Histidine, Phenylalanine, Guar Hydroxypropyltrimonium Chloride, Hydrolyzed Keratin, Vaccinium Myrtillus Fruit Extract, Disodium EDTA.",
    aroma: hairAroma,
    instruction: {
      steps: ["Вымойте волосы и отожмите лишнюю воду.", "Нанесите маску от середины длины до кончиков.", "Распределите гребнем и оставьте на 5–7 минут.", "Тщательно смойте водой."],
      amount: "Количество зависит от длины и густоты: начните с порции размером с грецкий орех.",
      tip: "Не наносите маску на корни, если волосы склонны быстро терять объём.",
    },
    category: "hair",
    image: assetPath("/images/figma/catalog-products/hair-mask.webp"),
  }),
  createProduct({
    id: "guava-shower-gel",
    name: "Гель для душа «Гуава»",
    description: gelDescription,
    volume: "500 мл",
    features: gelFeatures,
    usage: gelUsage,
    ingredients: `${gelIngredients}, CI 14720, CI 19140.`,
    aroma: "Освежающая кислинка лимонада и сочного лимона раскрываются сладкой гуавой и красными ягодами с лёгкими древесными нотами.",
    instruction: gelInstruction,
    category: "body",
    image: assetPath("/images/figma/catalog-products/gel-guava.webp"),
  }),
  createProduct({
    id: "hair-cream-spray",
    name: "Спрей-маска для волос",
    description: "Крем-спрей увлажняет и питает волосы, разглаживает их и облегчает расчёсывание, предотвращает спутывание и статическое электричество, делает волосы мягкими, гладкими и ухоженными, не утяжеляя их.",
    volume: "200 мл",
    features: ["Увлажнение и питание", "Быстрое восстановление", "Особенно для кудрявых волос"],
    usage: "Встряхните флакон. Распылите на чистые и подсушенные полотенцем волосы с расстояния 15–20 см. Расчешите для равномерного распределения и приступите к укладке, не смывая.",
    ingredients: "Aqua, Isopropyl Palmitate, Cetrimonium Chloride, Myristyl Alcohol, Bis-Cetearyl Amodimethicone, Ceteareth-7, Ceteareth-25, Silicone Quaternium-18, Trideceth-3, Trideceth-9, Sodium Benzoate, Potassium Sorbate, Parfum, Citric Acid, Sodium PCA, Sodium Lactate, Arginine, Aspartic Acid, PCA, Alanine, Glycine, Serine, Valine, Isoleucine, Threonine, Proline, Histidine, Phenylalanine, Hydrolyzed Keratin, Prunus Cerasus Fruit Extract, Disodium EDTA.",
    aroma: "Сочная вишня и прохладная мята, нежный жасмин и таинственный ирис раскрываются глубокими нотами сандала и тёплого мускуса.",
    instruction: {
      steps: ["Встряхните флакон.", "Подсушите чистые волосы полотенцем.", "Распылите по длине с расстояния 15–20 см.", "Расчешите и приступайте к укладке, не смывая."],
      amount: "Нанесите равномерной лёгкой вуалью, уделяя внимание сухим участкам длины.",
      tip: "На кудрявых волосах наносите перед формированием завитка.",
    },
    category: "hair",
    discount: 10,
    image: assetPath("/images/figma/catalog-products/hair-cream-spray.webp"),
  }),
  createProduct({
    id: "yuzu-shower-gel",
    name: "Гель для душа «Юдзу»",
    description: gelDescription,
    volume: "500 мл",
    features: gelFeatures,
    usage: gelUsage,
    ingredients: `${gelIngredients}, CI 14720, CI 19140.`,
    aroma: "Освежающая цедра юдзу и искрящиеся нотки бергамота раскрываются нежным флёром цветков юдзу и сочными аккордами мандарина, переходящими в тёплую амбру и бархатистую древесину сандала.",
    instruction: gelInstruction,
    category: "body",
    image: assetPath("/images/figma/catalog-products/gel-yuzu.webp"),
  }),
  createProduct({
    id: "lifting-face-cream",
    name: "Крем-лифтинг для лица",
    description: "Ежедневный крем-лифтинг для ухода за кожей лица с экстрактом асаи, кофеином и пептидами.",
    volume: "50 мл",
    features: ["Ежедневный уход", "Комфортная текстура", "Для лица и шеи"],
    usage: "Нанесите небольшое количество крема на очищенную кожу лица и шеи мягкими восходящими движениями, избегая области вокруг глаз. Используйте утром и/или вечером.",
    ingredients: "Полный состав будет добавлен после получения официальной карточки продукта. До публикации сверяйте INCI на упаковке.",
    aroma: "Информация об аромате будет добавлена после получения официальной карточки продукта.",
    instruction: {
      steps: ["Очистите и промокните кожу.", "Нанесите порцию крема размером с горошину.", "Распределите восходящими движениями по лицу и шее.", "Днём завершите уход средством с SPF."],
      amount: "Порции размером с горошину достаточно для лица; для шеи добавьте ещё немного.",
      tip: "Не растягивайте кожу и избегайте области вокруг глаз.",
    },
    category: "face",
    badge: "Новинка",
    discount: 0,
    oldPrice: 500,
    image: assetPath("/images/figma/catalog-products/face-lifting.webp"),
  }),
  createProduct({
    id: "blueberry-shower-gel",
    name: "Гель для душа «Голубика»",
    description: gelDescription,
    volume: "500 мл",
    features: gelFeatures,
    usage: gelUsage,
    ingredients: `${gelIngredients}, CI 42090, CI 14720.`,
    aroma: "Сочная лесная черника с яркой кислинкой раскрывается нежным цветочным аккордом василька и мягкими нотами сливочного йогурта.",
    instruction: gelInstruction,
    category: "body",
    image: assetPath("/images/figma/catalog-products/gel-blueberry.webp"),
  }),
];

export function formatPrice(value: number) {
  return `${new Intl.NumberFormat("ru-RU").format(value)} ₽`;
}
