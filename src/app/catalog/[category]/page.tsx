import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CatalogView } from "@/components/catalog-view";
import { SiteChrome, SiteFooter } from "@/components/site-shell";
import { categoryLabels, type ProductCategory } from "@/lib/store-data";
import styles from "../catalog.module.css";

const categories = Object.keys(categoryLabels) as ProductCategory[];

export const dynamicParams = false;

export function generateStaticParams() {
  return categories.map((category) => ({ category }));
}

export async function generateMetadata({ params }: PageProps<"/catalog/[category]">): Promise<Metadata> {
  const { category } = await params;
  if (!categories.includes(category as ProductCategory)) return { title: "Категория не найдена" };
  const label = categoryLabels[category as ProductCategory];
  return {
    title: label,
    description: `Косметика ASAYA в категории «${label}».`,
  };
}

export default async function CategoryPage({ params }: PageProps<"/catalog/[category]">) {
  const { category } = await params;
  if (!categories.includes(category as ProductCategory)) notFound();

  return (
    <>
      <div className={styles.page}>
        <SiteChrome />
        <CatalogView initialFilter={category as ProductCategory} />
      </div>
      <SiteFooter />
    </>
  );
}
