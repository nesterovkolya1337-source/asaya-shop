import type { Metadata } from "next";
import { SitePageContent } from "@/components/site-page-content";
import {ReturnOrderContext} from '@/components/return-order-context';

export const metadata: Metadata = { title: "Возврат и претензии" };
export default function Page(){return <><ReturnOrderContext/><SitePageContent id="returns"/></>;}
