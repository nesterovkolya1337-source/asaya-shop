import type { Metadata } from "next";
import { OrderStatusView } from "@/components/order-status-view";
import { SiteChrome, SiteFooter } from "@/components/site-shell";
import styles from "./order-status.module.css";

export const metadata: Metadata = { title: "Статус заказа" };

export default function OrderStatusPage() {
  return <><div className={styles.page}><SiteChrome /><OrderStatusView /></div><SiteFooter /></>;
}
