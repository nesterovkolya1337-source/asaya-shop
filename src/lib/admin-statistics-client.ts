import {AuthClientError,createStoreRequest} from './auth-client.ts';
export type Statistics={days:number;timezone:string;generatedAt:string;orders:number;paidOrders:number;cancelled:number;returned:number;salesMinor:number;units:number;daily:Array<{date:string;orders:number;salesMinor:number;units:number}>;topProducts:Array<{sku:string;name:string;units:number;salesMinor:number}>};
const object=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v))throw new AuthClientError('INVALID_RESPONSE');return v as Record<string,unknown>;};
const number=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
export function parseStatistics(raw:unknown):Statistics{
 const r=object(raw);
 if(![7,30,90].includes(Number(r.days))||typeof r.days!=='number'||r.timezone!=='Europe/Moscow'||typeof r.generatedAt!=='string'||!Number.isFinite(Date.parse(r.generatedAt))||!['orders','paidOrders','cancelled','returned','salesMinor','units'].every(k=>number(r[k]))||!Array.isArray(r.daily)||r.daily.length!==r.days||!Array.isArray(r.topProducts)||r.topProducts.length>10)throw new AuthClientError('INVALID_RESPONSE');
 const daily=r.daily.map(v=>{const d=object(v);if(typeof d.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(d.date)||!Number.isFinite(Date.parse(d.date))||!['orders','salesMinor','units'].every(k=>number(d[k])))throw new AuthClientError('INVALID_RESPONSE');return {date:d.date,orders:d.orders as number,salesMinor:d.salesMinor as number,units:d.units as number};});
 if(daily.some((d,i)=>i>0&&Date.parse(d.date)-Date.parse(daily[i-1].date)!==86400000)||['orders','salesMinor','units'].some(k=>daily.reduce((sum,d)=>sum+d[k as 'orders'|'salesMinor'|'units'],0)!==r[k])||Number(r.paidOrders)>Number(r.orders)||Number(r.cancelled)>Number(r.orders)||Number(r.returned)>Number(r.orders))throw new AuthClientError('INVALID_RESPONSE');
 const topProducts=r.topProducts.map(v=>{const p=object(v);if(typeof p.sku!=='string'||!p.sku||typeof p.name!=='string'||!number(p.units)||!number(p.salesMinor))throw new AuthClientError('INVALID_RESPONSE');return {sku:p.sku,name:p.name,units:p.units as number,salesMinor:p.salesMinor as number};});
 if(new Set(topProducts.map(p=>p.sku)).size!==topProducts.length)throw new AuthClientError('INVALID_RESPONSE');
 return {days:r.days,timezone:r.timezone,generatedAt:r.generatedAt,orders:r.orders as number,paidOrders:r.paidOrders as number,cancelled:r.cancelled as number,returned:r.returned as number,salesMinor:r.salesMinor as number,units:r.units as number,daily,topProducts};
}
export function createStatisticsClient(base:string,fetcher:typeof fetch=fetch){
 const request=createStoreRequest(base,fetcher);
 return {async get(days:number){if(![7,30,90].includes(days))throw new AuthClientError('INVALID_INPUT');const result=parseStatistics(await request('statistics?days='+days,'GET'));if(result.days!==days)throw new AuthClientError('INVALID_RESPONSE');return result;}};
}
