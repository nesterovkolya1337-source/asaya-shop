import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductView } from "@/components/product-view";
import { SiteChrome, SiteFooter } from "@/components/site-shell";
import { defaultProducts } from "@/lib/store-data";
import styles from "./product.module.css";

export const dynamicParams = false;

export function generateStaticParams() {
  return defaultProducts.map((product) => ({ id: product.id }));
}

export async function generateMetadata({ params }: PageProps<"/product/[id]">): Promise<Metadata> {
  const { id } = await params;
  const product = defaultProducts.find((item) => item.id === id);

  if (!product) return { title: "Товар не найден" };

  return {
    title: product.name,
    description: product.description,
  };
}

export default async function ProductPage({ params }: PageProps<"/product/[id]">) {
  const { id } = await params;
  if (!defaultProducts.some((product) => product.id === id)) notFound();

  return (
    <>
      <div className={styles.page}>
        <SiteChrome />
        <ProductView productId={id} />
      </div>
      <SiteFooter />
    </>
  );
}
