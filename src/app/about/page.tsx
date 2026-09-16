import { SitePageContent } from '@/components/site-page-content';
import type { Metadata } from 'next';
export const metadata: Metadata = { title: "О бренде" };
export default function Page() { return <SitePageContent key='about' id='about'/>; }
