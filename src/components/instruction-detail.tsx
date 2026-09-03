"use client";

import Image from "next/image";
import Link from "next/link";
import { useShop } from "@/components/shop-provider";
import styles from "@/app/instructions/[id]/instruction.module.css";

function getSafety(productId: string, category: string) {
  if (productId === "multi-hair-spray" || productId === "hair-cream-spray") {
    return {
      title: "Распылить на волосы — не на лицо",
      text: "Закройте глаза и направляйте распылитель только на длину волос с расстояния 15–20 см. Не вдыхайте аэрозоль. При попадании в глаза тщательно промойте их водой.",
    };
  }
  if (category === "hair") {
    return {
      title: "Только для волос и кожи головы",
      text: "Избегайте попадания в глаза и на слизистые. При появлении выраженного раздражения прекратите использование и тщательно смойте средство водой.",
    };
  }
  if (category === "face") {
    return {
      title: "Не наносить на область вокруг глаз",
      text: "Используйте только на неповреждённой коже. Перед первым применением протестируйте небольшое количество средства на локальном участке кожи.",
    };
  }
  if (productId.includes("shower-gel")) {
    return {
      title: "Для кожи тела, не для лица",
      text: "Не используйте на слизистых и избегайте попадания в глаза. Если это произошло, тщательно промойте глаза чистой водой.",
    };
  }
  return {
    title: "Наносить только на кожу тела",
    text: "Не используйте на лице, слизистых и повреждённых участках кожи. При появлении раздражения прекратите применение.",
  };
}

export function InstructionDetail({ productId }: { productId: string }) {
  const { products } = useShop();
  const product = products.find((item) => item.id === productId);
  if (!product) return null;
  const safety = getSafety(product.id, product.category);
  const isHairSpray = product.id === "multi-hair-spray" || product.id === "hair-cream-spray";
  const stepImages = isHairSpray
    ? [product.gallery[1], product.gallery[3], product.gallery[2], product.image].filter(Boolean)
    : [];

  return (
    <main>
      <nav className={styles.breadcrumbs}><Link href="/instructions">Инструкции</Link><span>/</span><span>{product.name}</span></nav>
      <section className={styles.hero}>
        <div className={styles.visual}><Image alt={product.name} fill priority sizes="(max-width: 760px) 94vw, 48vw" src={product.image} /></div>
        <div className={styles.intro}>
          <p>{product.volume}</p>
          <h1>{product.name}</h1>
          <span>{product.description}</span>
          <Link href={`/product/${product.id}`}>Перейти к товару</Link>
        </div>
      </section>
      <section className={`${styles.steps} ${isHairSpray ? styles.visualSteps : ""}`} aria-labelledby="steps-title">
        <header><p>Пошагово</p><h2 id="steps-title">Как использовать</h2></header>
        <ol>{product.instruction.steps.map((step, index) => <li key={step}>{stepImages[index] && <figure className={index === 3 ? styles.packshotStep : undefined}><Image alt={`${product.name}: шаг ${index + 1}`} fill sizes="(max-width: 760px) 74vw, 260px" src={stepImages[index]} /></figure>}<span>{step}</span></li>)}</ol>
      </section>
      <section className={styles.safety} aria-labelledby="safety-title">
        <span aria-hidden="true">!</span>
        <div><p>Важно перед применением</p><h2 id="safety-title">{safety.title}</h2><small>{safety.text}</small></div>
      </section>
      <section className={styles.notes}>
        <article><p>Сколько средства</p><h2>{product.instruction.amount}</h2></article>
        <article><p>Полезный приём</p><h2>{product.instruction.tip}</h2></article>
        <article className={styles.aroma}><p>Аромат</p><h2>{product.aroma}</h2></article>
      </section>
      <p className={styles.disclaimer}>Инструкция составлена по официальной карточке продукта. Если указания на вашей упаковке отличаются, следуйте маркировке конкретного флакона.</p>
    </main>
  );
}
