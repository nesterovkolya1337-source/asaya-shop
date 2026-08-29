import type { Metadata } from "next";
import { CatalogView } from "@/components/catalog-view";
import { SiteFooter, SiteHeader } from "@/components/site-shell";
import styles from "./catalog.module.css";

export const metadata: Metadata = {
  title: "Каталог",
  description: "Каталог уходовой косметики ASAYA для волос, тела и лица.",
};

export default function CatalogPage() {
  return (
    <>
      <div className={styles.page}>
        <SiteHeader />
        <CatalogView />
      </div>
      <SiteFooter />
    </>
  );
}
