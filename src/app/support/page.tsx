import type { Metadata } from "next";
import { InfoPage } from "@/components/info-page";

export const metadata: Metadata = { title: "Служба заботы" };

export default function SupportPage() {
  return <InfoPage eyebrow="ASAYA / Помощь" title="Служба заботы" lead="Поможем подобрать уход, разобраться с заказом или решить вопрос с доставкой." action={{ href: "mailto:hello@asaya.ru", label: "Написать нам" }} sections={[
    { number: "01", title: "Подбор ухода", text: "Расскажите о своей задаче — подскажем продукты и последовательность применения." },
    { number: "02", title: "Заказ и доставка", text: "Проверим комплектацию, статус или поможем изменить данные до отправки." },
    { number: "03", title: "Возврат", text: "Объясним порядок возврата и подскажем, какие фотографии или документы понадобятся." },
  ]} />;
}
