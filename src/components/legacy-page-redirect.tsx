'use client';
import {useEffect} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';

// HTTP redirects are served by nginx/Next. This covers client navigation and static previews.
export function LegacyPageRedirect({href,label}:{href:'/legal/privacy/'|'/account/#orders';label:string}){
 const router=useRouter();
 useEffect(()=>{router.replace(href);},[router,href]);
 return <main><p>Переходим…</p><Link href={href}>{label}</Link></main>;
}
