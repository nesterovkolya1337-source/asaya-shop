import type { Metadata } from "next";
import { CheckoutView } from "@/components/checkout-view";
import { SiteChrome, SiteFooter } from "@/components/site-shell";
import styles from "./checkout.module.css";

export const metadata: Metadata = {
  title: "Оформление заказа",
};

export default function CheckoutPage() {
  return (
    <>
      <div className={styles.page}>
        <SiteChrome />
        <CheckoutView />
      </div>
      <SiteFooter />
    </>
  );
}
