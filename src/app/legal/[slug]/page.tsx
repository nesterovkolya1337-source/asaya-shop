import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteChrome, SiteFooter } from "@/components/site-shell";
import styles from "./legal.module.css";

const documents = {
  privacy: {
    title: "Политика конфиденциальности",
    sections: ["Кто является оператором данных", "Какие данные и для чего обрабатываются", "Сроки хранения и способы защиты", "Передача сервисам оплаты и доставки", "Права пользователя и контакты оператора"],
  },
  "personal-data": {
    title: "Согласие на обработку персональных данных",
    sections: ["Перечень данных", "Цели обработки", "Действия с данными", "Срок действия согласия", "Порядок отзыва согласия"],
  },
  offer: {
    title: "Публичная оферта",
    sections: ["Сведения о продавце", "Предмет и момент заключения договора", "Цена, оплата и подтверждение заказа", "Доставка и получение", "Возврат, претензии и ответственность"],
  },
  cookies: {
    title: "Использование файлов cookie",
    sections: ["Необходимые cookie", "Настройки и предпочтения", "Аналитика", "Сроки хранения", "Как изменить выбор"],
  },
} as const;

type LegalSlug = keyof typeof documents;
type LegalPageProps = { params: Promise<{ slug: string }> };

export const dynamicParams = false;
export function generateStaticParams() { return Object.keys(documents).map((slug) => ({ slug })); }

export async function generateMetadata({ params }: LegalPageProps): Promise<Metadata> {
  const { slug } = await params;
  const document = documents[slug as LegalSlug];
  return { title: document?.title ?? "Документ", robots: { index: false, follow: false } };
}

export default async function LegalPage({ params }: LegalPageProps) {
  const { slug } = await params;
  const document = documents[slug as LegalSlug];
  if (!document) notFound();

  return (
    <>
      <div className={styles.page}>
        <SiteChrome />
        <main>
          <header><p>ASAYA / Документы</p><h1>{document.title}</h1></header>
          <aside><strong>Проект раздела</strong><span>До приёма реальных заказов сюда нужно внести реквизиты продавца, используемые сервисы и окончательный текст, проверенный юристом. Сейчас страница показывает полную структуру и не выдаёт черновик за действующий документ.</span></aside>
          <section>
            {document.sections.map((section, index) => <article key={section}><span>0{index + 1}</span><h2>{section}</h2><p>Содержание будет заполнено после утверждения юридических реквизитов и схемы обработки данных магазина.</p></article>)}
          </section>
          <Link href="/support">Задать вопрос службе заботы</Link>
        </main>
      </div>
      <SiteFooter />
    </>
  );
}
