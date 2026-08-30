import type { Metadata } from "next";
import { InfoPage } from "@/components/info-page";

export const metadata: Metadata = { title: "Где купить" };

export default function StoresPage() {
  return <InfoPage eyebrow="ASAYA / Покупка" title="Где купить" lead="Официальный сайт и подтверждённые площадки ASAYA." action={{ href: "/where-to-buy", label: "Все площадки" }} sections={[
    { number: "01", title: "Официальный сайт", text: "Каталог, инструкции и предложения ASAYA в одном месте." },
    { number: "02", title: "Маркетплейсы", text: "ASAYA представлена на Ozon и Wildberries." },
    { number: "03", title: "Бьюти-ритейл", text: "Продукты бренда также можно искать в Золотом Яблоке." },
  ]} />;
}
