import type {Metadata} from 'next';
import {LegacyPageRedirect} from '@/components/legacy-page-redirect';
export const metadata:Metadata={robots:{index:false,follow:false},alternates:{canonical:'https://asaya.ru/legal/privacy/'}};
export default function CookiesRedirect(){return <LegacyPageRedirect href="/legal/privacy/" label="Политика конфиденциальности"/>;}
