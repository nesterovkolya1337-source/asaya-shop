import type { Metadata } from "next";
import { InfoPage } from "@/components/info-page";

export const metadata: Metadata = { title: "Где нас найти" };

export default function StoresPage() {
  return <InfoPage eyebrow="ASAYA / Магазины" title="Где нас найти" lead="Сейчас весь ассортимент доступен онлайн. Здесь появятся подтверждённые партнёры и офлайн-точки ASAYA." action={{ href: "/catalog", label: "Купить онлайн" }} sections={[
    { number: "01", title: "Официальный сайт", text: "Актуальные продукты, цены и специальные предложения ASAYA без посредников." },
    { number: "02", title: "Партнёры", text: "Мы добавим только проверенные площадки, где гарантирована оригинальная продукция." },
    { number: "03", title: "Офлайн", text: "Адреса магазинов и корнеров появятся после открытия — с картой и графиком работы." },
  ]} />;
}
