import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteChrome, SiteFooter } from "@/components/site-shell";
import { defaultProducts } from "@/lib/store-data";
import styles from "./instruction.module.css";

export function generateStaticParams() {
  return defaultProducts.map((product) => ({ id: product.id }));
}

type InstructionPageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: InstructionPageProps): Promise<Metadata> {
  const { id } = await params;
  const product = defaultProducts.find((item) => item.id === id);
  return { title: product ? `Как использовать ${product.name}` : "Инструкция" };
}

export default async function InstructionPage({ params }: InstructionPageProps) {
  const { id } = await params;
  const product = defaultProducts.find((item) => item.id === id);
  if (!product) notFound();

  return (
    <>
      <div className={styles.page}>
        <SiteChrome />
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
          <section className={styles.steps} aria-labelledby="steps-title">
            <header><p>Пошагово</p><h2 id="steps-title">Как использовать</h2></header>
            <ol>{product.instruction.steps.map((step) => <li key={step}><span>{step}</span></li>)}</ol>
          </section>
          <section className={styles.notes}>
            <article><p>Сколько средства</p><h2>{product.instruction.amount}</h2></article>
            <article><p>Полезный приём</p><h2>{product.instruction.tip}</h2></article>
            <article className={styles.aroma}><p>Аромат</p><h2>{product.aroma}</h2></article>
          </section>
          <p className={styles.disclaimer}>Инструкция составлена по официальной карточке продукта. Если указания на вашей упаковке отличаются, следуйте маркировке конкретного флакона.</p>
        </main>
      </div>
      <SiteFooter />
    </>
  );
}
