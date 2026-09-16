import { SitePageContent } from '@/components/site-page-content';
import type { Metadata } from 'next';
export const metadata: Metadata = { title: "Доставка и оплата" };
export default function Page() { return <SitePageContent key='delivery' id='delivery'/>; }
