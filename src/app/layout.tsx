import type { Metadata } from "next";
import { ShopProvider } from "@/components/shop-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "ASAYA",
    template: "%s — ASAYA",
  },
  description: "Интернет-магазин уходовой косметики ASAYA.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru">
      <body>
        <ShopProvider>{children}</ShopProvider>
      </body>
    </html>
  );
}
