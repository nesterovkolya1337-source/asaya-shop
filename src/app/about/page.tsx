import type { Metadata } from "next";
import { InfoPage } from "@/components/info-page";

export const metadata: Metadata = { title: "О бренде" };

export default function AboutPage() {
  return <InfoPage eyebrow="ASAYA / О бренде" title="Уход, который даёт результат и эмоции" lead="Мы создаём понятные ежедневные продукты и превращаем рутину в приятный ритуал заботы о себе." action={{ href: "/catalog", label: "Смотреть продукты" }} sections={[
    { number: "01", title: "Эффективность", text: "Каждый продукт решает конкретную задачу и легко встраивается в ежедневный уход." },
    { number: "02", title: "Удовольствие", text: "Текстуры, ароматы и дизайн делают привычные действия маленьким моментом для себя." },
    { number: "03", title: "Честность", text: "Понятные обещания, прозрачный состав и никакой лишней сложности между вами и результатом." },
  ]} />;
}
