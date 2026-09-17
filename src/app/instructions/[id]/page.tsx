import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InstructionDetail } from "@/components/instruction-detail";
import { SiteChrome, SiteFooter } from "@/components/site-shell";
import { defaultProducts } from "@/lib/store-data";
import styles from "./instruction.module.css";

export function generateStaticParams() {
  return defaultProducts.map((product) => ({ id: product.id }));
}

type InstructionPageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: InstructionPageProps): Promise<Metadata> {
  if(process.env.NEXT_PUBLIC_CATALOG_SOURCE!=='demo')return {title:'Инструкция ASAYA'};
  const { id } = await params;
  const product = defaultProducts.find((item) => item.id === id);
  return { title: product ? `Как использовать ${product.name}` : "Инструкция" };
}

export default async function InstructionPage({ params }: InstructionPageProps) {
  const { id } = await params;
  const product = defaultProducts.find((item) => item.id === id);
  if (process.env.NEXT_PUBLIC_CATALOG_SOURCE==='demo'&&!product) notFound();

  return (
    <>
      <div className={styles.page}>
        <SiteChrome />
        <InstructionDetail productId={id} />
      </div>
      <SiteFooter />
    </>
  );
}
