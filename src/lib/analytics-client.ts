import {AuthClientError,createStoreRequest} from './auth-client.ts';
export type AnalyticsQuery={days?:'7'|'30'|'90';from?:string;to?:string;sku?:string;search?:string;category?:string};
export type AnalyticsCounters={orders:number;paidOrders:number;salesMinor:number;units:number;cancelled:number;returnedUnits:number;returnedMinor:number|null;impressions:number;opens:number;clicks:number;adds:number;checkouts:number};
export type AnalyticsMetrics=AnalyticsCounters&{ctr:number|null;addRate:number|null;paidConversion:number|null;averagePriceMinor:number|null;aovMinor:number|null};
export type AnalyticsReport={period:{from:string;to:string;days:number;sku:string;search:string;category:string};timezone:'Europe/Moscow';basis:'order_created_cohort';generatedAt:string;summary:AnalyticsMetrics;daily:Array<AnalyticsCounters&{date:string}>;products:Array<AnalyticsMetrics&{sku:string;name:string;category:string|null}>;quality:{unknownRefundOrders:number;confirmedRefundMinor:number;refundAllocationIncomplete:boolean;unknownCategory:boolean};eventCoverageStart:string|null};
const obj=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v))throw new AuthClientError('INVALID_RESPONSE');return v as Record<string,unknown>;};
const fail=()=>{throw new AuthClientError('INVALID_RESPONSE');};
const integer=(v:unknown):number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0?v:fail();
const str=(v:unknown,max=300):string=>typeof v==='string'&&v.length<=max?v:fail();
const date=(v:unknown)=>{const s=str(v,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s))||new Date(s).toISOString().slice(0,10)!==s)fail();return s;};
const iso=(v:unknown)=>{const s=str(v,40);if(!Number.isFinite(Date.parse(s)))fail();return s;};
const boolean=(v:unknown):boolean=>typeof v==='boolean'?v:fail();
function counters(raw:unknown):AnalyticsCounters{
 const r=obj(raw),n=(k:string)=>integer(r[k]);
 return {orders:n('orders'),paidOrders:n('paidOrders'),salesMinor:n('salesMinor'),units:n('units'),cancelled:n('cancelled'),returnedUnits:n('returnedUnits'),returnedMinor:r.returnedMinor===null?null:n('returnedMinor'),impressions:n('impressions'),opens:n('opens'),clicks:n('clicks'),adds:n('adds'),checkouts:n('checkouts')};
}
function metrics(raw:unknown):AnalyticsMetrics{
 const r=obj(raw),result={...counters(r)} as AnalyticsMetrics;
 for(const key of ['ctr','addRate','paidConversion','averagePriceMinor','aovMinor'] as const){const v=r[key];if(v!==null&&(typeof v!=='number'||!Number.isFinite(v)||v<0))fail();result[key]=v as number|null;}
 return result;
}
export function parseAnalytics(raw:unknown):AnalyticsReport{
 const r=obj(raw),p=obj(r.period),q=obj(r.quality);
 if(r.timezone!=='Europe/Moscow'||r.basis!=='order_created_cohort'||!Array.isArray(r.daily)||!Array.isArray(r.products))fail();
 const period={from:date(p.from),to:date(p.to),days:integer(p.days),sku:str(p.sku,100),search:str(p.search,100),category:str(p.category,20)};
 if(period.days<1||period.days>366||period.days!==(Date.parse(period.to)-Date.parse(period.from))/86400000+1)fail();
 const summary=metrics(r.summary);
 const daily=(r.daily as unknown[]).map(v=>{const d=obj(v);return {date:date(d.date),...counters(d)};});
 if(daily.length!==period.days||daily.some((d,i)=>Date.parse(d.date)!==Date.parse(period.from)+i*86400000))fail();
 for(const key of ['orders','paidOrders','salesMinor','units','cancelled','returnedUnits','impressions','opens','clicks','adds','checkouts'] as const)if(daily.reduce((s,d)=>s+d[key],0)!==summary[key])fail();
 const products=(r.products as unknown[]).map(v=>{const a=obj(v),category=a.category===null?null:str(a.category,20);if(category!==null&&!['hair','body','face','sets'].includes(category))fail();return {sku:str(a.sku,100),name:str(a.name),category,...metrics(a)};});
 if(new Set(products.map(p=>p.sku)).size!==products.length)fail();
 return {period,timezone:'Europe/Moscow',basis:'order_created_cohort',generatedAt:iso(r.generatedAt),summary,daily,products,
  quality:{unknownRefundOrders:integer(q.unknownRefundOrders),confirmedRefundMinor:integer(q.confirmedRefundMinor),refundAllocationIncomplete:boolean(q.refundAllocationIncomplete),unknownCategory:boolean(q.unknownCategory)},eventCoverageStart:r.eventCoverageStart===null?null:iso(r.eventCoverageStart)};
}
export function createAnalyticsClient(base:string,fetcher:typeof fetch=fetch){
 const request=createStoreRequest(base,fetcher);
 return {async get(query:AnalyticsQuery){const params=new URLSearchParams();for(const [k,v] of Object.entries(query))if(v)params.set(k,v);return parseAnalytics(await request('analytics?'+params.toString(),'GET'));}};
}
