import type { Metadata } from "next";
import { AdminDashboard } from "@/components/admin-dashboard";
import { SiteHeader } from "@/components/site-shell";
import styles from "./admin.module.css";

export const metadata: Metadata = {
  title: "Управление магазином",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return (
    <div className={styles.page}>
      <SiteHeader />
      <AdminDashboard />
    </div>
  );
}
