import { SitePageContent } from '@/components/site-page-content';
import type { Metadata } from 'next';
export const metadata: Metadata = { title: "Служба заботы" };
export default function Page() { return <SitePageContent key='support' id='support'/>; }
