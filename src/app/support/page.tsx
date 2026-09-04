import type { Metadata } from "next";
import Link from "next/link";
import { InfoPage } from "@/components/info-page";
import { companyData } from "@/lib/company-data";

export const metadata: Metadata = { title: "Служба заботы" };

export default function SupportPage() {
  return <InfoPage eyebrow="ASAYA / Помощь" title="Служба заботы" lead="Команда ASAYA помогает с вопросами о товарах, заказе, оплате, доставке, статусе, качестве и возврате." action={{ href: "https://t.me/asayahelp", label: "Написать в Telegram" }} sections={[
    { number: "01", title: "Вопрос по товару", text: <>Поможем выбрать средство и разобраться в составе, аромате или применении. Готовые шаги есть в разделе <Link href="/instructions">«Инструкции»</Link>.</> },
    { number: "02", title: "Вопрос по заказу", text: "Проверьте состав заказа и данные получателя. Если нужно что-то уточнить, сообщите нам номер заказа." },
    { number: "03", title: "Оплата", text: "Поможем, если платёж не проходит, подтверждение не пришло или сумма заказа отображается неверно." },
    { number: "04", title: "Доставка", text: <>Информация о способах и расчёте доставки собрана на странице <Link href="/delivery">«Доставка и оплата»</Link>.</> },
    { number: "05", title: "Статус заказа", text: <>Текущий этап можно проверить на странице <Link href="/order-status">«Статус заказа»</Link>. Если данные долго не обновляются, напишите нам.</> },
    { number: "06", title: "Проблема с товаром", text: "Сохраните упаковку и сделайте фотографии товара, этикетки и повреждения. Приложите их к обращению вместе с номером заказа." },
    { number: "07", title: "Возврат или претензия", text: <>Порядок действий для разных случаев описан в разделе <Link href="/returns">«Возврат и претензии»</Link>.</> },
    { number: "08", title: "Другой вопрос", text: <>Напишите в <a href="https://t.me/asayahelp" rel="noreferrer" target="_blank">Telegram</a> или на почту <a href={companyData.supportEmailHref}>{companyData.supportEmail}</a>.</> },
  ]} />;
}
