import type { Metadata } from "next";
import { CatalogView } from "@/components/catalog-view";
import { SiteChrome, SiteFooter } from "@/components/site-shell";
import styles from "./catalog.module.css";

export const metadata: Metadata = {
  title: "Каталог",
  description: "Каталог уходовой косметики ASAYA для волос, тела и лица.",
};

export default function CatalogPage() {
  return (
    <>
      <div className={styles.page}>
        <SiteChrome />
        <CatalogView />
      </div>
      <SiteFooter />
    </>
  );
}
