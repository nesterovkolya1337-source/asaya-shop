import type { Metadata } from "next";
import { SitePageContent } from "@/components/site-page-content";

export const metadata: Metadata = { title: "Инструкции по применению" };
export default function Page(){return <SitePageContent id="instructions"/>;}
