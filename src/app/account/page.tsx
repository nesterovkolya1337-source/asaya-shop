import type { Metadata } from "next";
import { AccountView } from "@/components/account-view";
import { SiteFooter, SiteHeader } from "@/components/site-shell";
import styles from "./account.module.css";

export const metadata: Metadata = {
  title: "Личный кабинет",
};

export default function AccountPage() {
  return (
    <>
      <div className={styles.page}>
        <SiteHeader />
        <AccountView />
      </div>
      <SiteFooter />
    </>
  );
}
