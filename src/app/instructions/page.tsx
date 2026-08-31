import type { Metadata } from "next";
import { SiteChrome, SiteFooter } from "@/components/site-shell";
import { InstructionsGrid } from "./instructions-grid";
import styles from "./instructions.module.css";

export const metadata: Metadata = { title: "Инструкции по применению" };

export default function InstructionsPage() {
  return (
    <>
      <div className={styles.page}>
        <SiteChrome />
        <main>
          <header className={styles.heading}>
            <p>ASAYA / Инструкции</p>
            <h1>Как пользоваться продуктами</h1>
            <span>Короткие и понятные шаги, чтобы средство работало так, как задумано.</span>
          </header>
          <InstructionsGrid />
        </main>
      </div>
      <SiteFooter />
    </>
  );
}
