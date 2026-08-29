import type { Metadata } from "next";
import { InfoPage } from "@/components/info-page";

export const metadata: Metadata = { title: "Доставка и оплата" };

export default function DeliveryPage() {
  return <InfoPage eyebrow="ASAYA / Покупка" title="Доставка и оплата" lead="Выберите удобный способ получения. Точная стоимость и срок появятся при оформлении заказа." action={{ href: "/checkout", label: "Перейти к оформлению" }} sections={[
    { number: "01", title: "Пункты выдачи", text: "Найдём ближайший пункт после подключения службы доставки. От 1 500 ₽ доставка будет бесплатной." },
    { number: "02", title: "Курьер", text: "Доставка до двери в выбранный интервал. Предварительный срок — от одного до трёх дней." },
    { number: "03", title: "Безопасная оплата", text: "Карта обрабатывается платёжным провайдером. ASAYA не хранит реквизиты банковских карт." },
  ]} />;
}
