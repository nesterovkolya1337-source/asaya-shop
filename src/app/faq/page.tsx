import { SitePageContent } from '@/components/site-page-content';
import type { Metadata } from 'next';
export const metadata: Metadata = { title: "Вопросы и ответы" };
export default function Page() { return <SitePageContent key='faq' id='faq'/>; }
