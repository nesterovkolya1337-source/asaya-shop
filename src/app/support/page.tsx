import type { Metadata } from "next";
import { InfoPage } from "@/components/info-page";
import { companyData } from "@/lib/company-data";

export const metadata: Metadata = { title: "Служба заботы" };

export default function SupportPage() {
  return <InfoPage eyebrow="ASAYA / Помощь" title="Служба заботы" lead="Поможем подобрать уход, разобраться с применением, заказом или повреждённым товаром." action={{ href: "https://t.me/asayahelp", label: "Написать в Telegram" }} sections={[
    { number: "01", title: "Подбор и применение", text: "Расскажите о своей задаче — подскажем продукт, количество средства и последовательность ухода." },
    { number: "02", title: "Заказ и доставка", text: "Поможем проверить заказ, доставку и данные получателя. Статус заказа также будет доступен в личном кабинете." },
    { number: "03", title: "Повреждение или возврат", text: "Если средство протекло, разбилось или пришло не то — напишите нам и приложите фотографии упаковки и товара." },
    { number: "04", title: "Официальные контакты", text: `${companyData.email} · ${companyData.phone}. Продавец: ${companyData.shortName}, ИНН ${companyData.inn}.` },
  ]} />;
}
