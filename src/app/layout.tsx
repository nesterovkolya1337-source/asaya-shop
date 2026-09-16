import type { Metadata } from "next";
import localFont from "next/font/local";
import { ShopProvider } from "@/components/shop-provider";
import { CatalogStatus } from "@/components/catalog-status";
import { YandexMetrika } from "@/components/yandex-metrika";
import { SiteContentProvider } from "@/components/site-content-provider";
import "./globals.css";

const involve = localFont({
  src: [
    { path: "../../public/fonts/involve/Involve-VF.ttf", weight: "400 700", style: "normal" },
    { path: "../../public/fonts/involve/Involve-Oblique-VF.ttf", weight: "400 700", style: "italic" },
  ],
  variable: "--font-involve-loaded",
  display: "swap",
});

const gramatika = localFont({
  src: [
    { path: "../../public/fonts/gramatika/Gramatika-Regular.ttf", weight: "400", style: "normal" },
    { path: "../../public/fonts/gramatika/Gramatika-Bold.ttf", weight: "700", style: "normal" },
    { path: "../../public/fonts/gramatika/Gramatika-Slanted.ttf", weight: "400", style: "italic" },
    { path: "../../public/fonts/gramatika/Gramatika-BoldSlanted.ttf", weight: "700", style: "italic" },
  ],
  variable: "--font-gramatika-loaded",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "ASAYA",
    template: "%s — ASAYA",
  },
  description: "Интернет-магазин уходовой косметики ASAYA.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html className={`${involve.variable} ${gramatika.variable}`} data-scroll-behavior="smooth" lang="ru">
      <body>
        <ShopProvider><SiteContentProvider><YandexMetrika /><CatalogStatus />{children}</SiteContentProvider></ShopProvider>
      </body>
    </html>
  );
}
