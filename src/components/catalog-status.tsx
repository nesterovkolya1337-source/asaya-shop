"use client";
import {useEffect,useState} from 'react';
import {usePathname} from 'next/navigation';
import {assetPath} from '@/lib/asset-path';
import {visibleBanner,type StorefrontBanner} from '@/lib/storefront-banner';
export function CatalogStatus(){
 const [banner,setBanner]=useState<StorefrontBanner|null>(null),pathname=usePathname();
 useEffect(()=>{let active=true;const read=async()=>{try{const r=await fetch(assetPath('/api/store/v1/banner'),{cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(8000)});const value=r.ok?visibleBanner(await r.json()):null;if(active)setBanner(value);}catch{if(active)setBanner(null);}};void read();window.addEventListener('focus',read);return()=>{active=false;window.removeEventListener('focus',read);};},[pathname]);
 if(!banner||pathname==='/admin'||pathname.startsWith('/admin/'))return null;
 return <div role="status" className="catalog-status"><p>{banner.message}</p>{banner.buttonText&&banner.buttonUrl&&<a href={banner.buttonUrl}>{banner.buttonText}</a>}</div>;
}
