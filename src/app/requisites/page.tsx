import type { Metadata } from "next";
import { InfoPage } from "@/components/info-page";
import { companyData } from "@/lib/company-data";

export const metadata: Metadata = { title: "Реквизиты" };

export default function RequisitesPage() {
  return <InfoPage eyebrow="ASAYA / Документы" title="Реквизиты" lead="Основная юридическая информация о продавце." sections={[
    { number: "01", title: "Компания", text: <>{companyData.fullName}<br />Сокращённое наименование: {companyData.shortName}</> },
    { number: "02", title: "Регистрация", text: <>ИНН: {companyData.inn}<br />КПП: {companyData.kpp}<br />ОГРН: {companyData.ogrn}</> },
    { number: "03", title: "Адрес", text: <>Юридический адрес: {companyData.legalAddress}<br />Почтовый адрес: {companyData.postalAddress}</> },
    { number: "04", title: "Юридическая почта", text: <a href={companyData.legalEmailHref}>{companyData.legalEmail}</a> },
  ]} />;
}
