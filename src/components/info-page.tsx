import Link from "next/link";
import type { ReactNode } from "react";
import { SiteChrome, SiteFooter } from "@/components/site-shell";
import styles from "./info-page.module.css";

type InfoSection = {
  number: string;
  title: string;
  text: ReactNode;
};

export function InfoPage({
  eyebrow,
  title,
  lead,
  sections,
  action,
}: {
  eyebrow: string;
  title: string;
  lead: string;
  sections: InfoSection[];
  action?: { href: string; label: string };
}) {
  return (
    <>
      <div className={styles.page}>
        <SiteChrome />
        <main>
          <header className={styles.heading}>
            <p>{eyebrow}</p>
            <h1>{title}</h1>
            <span>{lead}</span>
            {action && (action.href.startsWith("http")
              ? <a href={action.href} rel="noreferrer" target="_blank">{action.label}</a>
              : <Link href={action.href}>{action.label}</Link>)}
          </header>
          <section className={styles.grid} aria-label={title}>
            {sections.map((section) => (
              <article key={section.number}>
                <span>{section.number}</span>
                <h2>{section.title}</h2>
                <p>{section.text}</p>
              </article>
            ))}
          </section>
        </main>
      </div>
      <SiteFooter />
    </>
  );
}
