import type { Metadata } from "next";
import { FavoritesView } from "@/components/favorites-view";
import { SiteChrome, SiteFooter } from "@/components/site-shell";
import styles from "./favorites.module.css";

export const metadata: Metadata = {
  title: "Избранное",
};

export default function FavoritesPage() {
  return (
    <>
      <div className={styles.page}>
        <SiteChrome />
        <FavoritesView />
      </div>
      <SiteFooter />
    </>
  );
}
