import type { Metadata } from "next";
import {LegacyPageRedirect} from '@/components/legacy-page-redirect';

export const metadata: Metadata = { title: "Мои заказы", robots:{index:false,follow:false} };

export default function OrderStatusPage() {
  return <LegacyPageRedirect href="/account/#orders" label="Мои заказы"/>;
}
