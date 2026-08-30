import type { Metadata } from "next";
import { InfoPage } from "@/components/info-page";

export const metadata: Metadata = { title: "Возврат и претензии" };

export default function ReturnsPage() {
  return <InfoPage eyebrow="ASAYA / Помощь" title="Возврат и претензии" lead="Если товар повреждён, протёк или не совпадает с заказом — служба заботы поможет разобраться." action={{ href: "https://t.me/asayahelp", label: "Связаться с поддержкой" }} sections={[
    { number: "01", title: "Сохраните упаковку", text: "Не выбрасывайте транспортную коробку, пломбы и этикетки до ответа службы заботы." },
    { number: "02", title: "Сделайте фотографии", text: "Снимите общий вид посылки, этикетку, повреждение и сам продукт — так мы быстрее разберём случай." },
    { number: "03", title: "Напишите нам", text: "Укажите номер заказа и кратко опишите ситуацию. Способ решения зависит от места покупки и состояния товара." },
  ]} />;
}
