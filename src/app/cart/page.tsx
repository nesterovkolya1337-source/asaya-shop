import type { Metadata } from "next";
import { CartView } from "@/components/cart-view";
import { SiteChrome, SiteFooter } from "@/components/site-shell";
import styles from "./cart.module.css";

export const metadata: Metadata = {
  title: "Корзина",
};

export default function CartPage() {
  return (
    <>
      <div className={styles.page}>
        <SiteChrome />
        <CartView />
      </div>
      <SiteFooter />
    </>
  );
}
