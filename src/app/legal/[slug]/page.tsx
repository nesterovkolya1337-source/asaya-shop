import type { Metadata } from "next";
import {notFound} from "next/navigation";
import {SitePageContent} from "@/components/site-page-content";
import {sitePageDefaults} from "@/lib/site-content-client";
const legalSlugs=['privacy','personal-data','offer'] as const;
type LegalSlug=typeof legalSlugs[number];
type Props={params:Promise<{slug:string}>};
export const dynamicParams=false;
export function generateStaticParams(){return legalSlugs.map(slug=>({slug}));}
export async function generateMetadata({params}:Props):Promise<Metadata>{
 const {slug}=await params;
 return {title:legalSlugs.includes(slug as LegalSlug)?sitePageDefaults[slug as LegalSlug].blocks[0].values.title:'Документ',robots:{index:false,follow:false}};
}
export default async function LegalPage({params}:Props){
 const {slug}=await params;if(!legalSlugs.includes(slug as LegalSlug))notFound();
 return <SitePageContent id={slug as LegalSlug}/>;
}
