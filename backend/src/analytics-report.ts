import {z} from 'zod';
import {Database} from './db.js';
import {DomainError} from './core.js';

const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s=>Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s);
export function analyticsPeriod(raw:unknown,now:Date){
 const q=z.object({days:z.enum(['7','30','90']).optional(),from:day.optional(),to:day.optional(),sku:z.string().trim().max(100).default(''),search:z.string().trim().max(100).default(''),category:z.enum(['','hair','body','face','sets','unknown']).default('')}).strict().parse(raw);
 if(!!q.from!==!!q.to||q.days&&q.from)throw new DomainError('INVALID_PERIOD',400);
 const today=new Date(now.getTime()+3*3600000).toISOString().slice(0,10),to=q.to??today;
 const from=q.from??new Date(Date.parse(to)-(Number(q.days??30)-1)*86400000).toISOString().slice(0,10);
 const days=(Date.parse(to)-Date.parse(from))/86400000+1;
 if(days<1||days>366||to>today||from<'2020-01-01')throw new DomainError('INVALID_PERIOD',400);
 return {from,to,days,sku:q.sku,search:q.search,category:q.category};
}
const safe=(v:unknown)=>{const n=Number(v);if(!Number.isSafeInteger(n)||n<0)throw new DomainError('ANALYTICS_RANGE',503);return n;};
const ratio=(a:number,b:number)=>b?Math.round(a/b*10000)/100:null;
// Russian and Latin search must behave identically in C-locale test databases
// and production. Only internal SQL identifiers are passed to this helper.
const fold=(column:string)=>`lower(translate(${column},'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ','абвгдеёжзийклмнопрстуфхцчшщъыьэюя'))`;
type Counters={orders:number;paidOrders:number;salesMinor:number;units:number;cancelled:number;returnedUnits:number;returnedMinor:number|null;impressions:number;opens:number;clicks:number;adds:number;checkouts:number};
const blank=():Counters=>({orders:0,paidOrders:0,salesMinor:0,units:0,cancelled:0,returnedUnits:0,returnedMinor:0,impressions:0,opens:0,clicks:0,adds:0,checkouts:0});
const enrich=(r:Counters)=>({...r,ctr:ratio(r.clicks,r.impressions),addRate:ratio(r.adds,r.opens),paidConversion:ratio(r.paidOrders,r.opens),averagePriceMinor:r.units?Math.round(r.salesMinor/r.units):null,aovMinor:r.paidOrders?Math.round(r.salesMinor/r.paidOrders):null});

export class AnalyticsReport {
 constructor(private db:Database,private clock=()=>new Date()){}
 async get(actor:string,raw:unknown){
  if(!(await this.db.pool.query("SELECT 1 FROM users WHERE id=$1 AND role='admin' AND NOT disabled",[actor])).rowCount)throw new DomainError('FORBIDDEN',403);
  const now=this.clock(),period=analyticsPeriod(raw,now);
  return this.db.transaction(async tx=>{
   await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
   const params=[period.from+'T00:00:00+03:00',new Date(Date.parse(period.to+'T00:00:00+03:00')+86400000),now,period.sku,period.category,period.search];
   // Sales are a cohort by order creation date, not cash movements by payment date.
   // Refunds never delete the original paid sale. Monetary returns and quantities
   // remain independent: a cancellation/refusal is not a confirmed cash refund.
   const lines=(await tx.query(`WITH selected AS (
    SELECT o.id,o.created_at,o.status,o.payment_status,o.delivery_status,o.total_minor,
     EXISTS(SELECT 1 FROM order_analytics_events e WHERE e.order_id=o.id AND e.event_type='order_paid') AS paid,
     COALESCE((SELECT sum(r.amount_minor) FROM refunds r JOIN payments p ON p.id=r.payment_id WHERE p.order_id=o.id AND r.status='succeeded'),0) AS refund_minor
    FROM orders o WHERE o.created_at >= $1 AND o.created_at < $2 AND o.created_at <= $3
   ) SELECT o.id,(o.created_at AT TIME ZONE 'Europe/Moscow')::date::text AS day,o.status,o.payment_status,o.paid,o.total_minor,o.refund_minor,
    i.sku,i.name_snapshot AS name,i.category_snapshot AS category,i.quantity,i.line_minor,
    CASE WHEN o.status='completed' OR o.delivery_status='returned' THEN i.refused_count ELSE 0 END AS returned_units,
    CASE WHEN o.refund_minor>=o.total_minor AND o.total_minor>0 THEN i.line_minor
     WHEN o.refund_minor>0 OR o.payment_status IN ('partially_refunded','refunded') THEN NULL ELSE 0 END AS returned_minor
   FROM selected o JOIN order_items i ON i.order_id=o.id
   WHERE ($4='' OR i.sku=$4) AND ($5='' OR COALESCE(i.category_snapshot,'unknown')=$5)
    AND ($6='' OR strpos(${fold('i.sku')},${fold('$6')})>0 OR strpos(${fold('i.name_snapshot')},${fold('$6')})>0)
   ORDER BY o.created_at,o.id,i.sku`,params)).rows;
   const traffic=(await tx.query(`SELECT e.sku,(array_agg(e.product_name ORDER BY e.occurred_at DESC))[1] AS name,
    (array_agg(e.category ORDER BY e.occurred_at DESC))[1] AS category,
    (e.occurred_at AT TIME ZONE 'Europe/Moscow')::date::text AS day,e.event_type,count(*) AS n
    FROM product_analytics_events e
    WHERE e.occurred_at >= $1 AND e.occurred_at < $2 AND e.occurred_at <= $3
     AND ($4='' OR e.sku=$4) AND ($5='' OR COALESCE(e.category,'unknown')=$5)
     AND ($6='' OR strpos(${fold('e.sku')},${fold('$6')})>0 OR strpos(${fold('e.product_name')},${fold('$6')})>0)
    GROUP BY e.sku,day,e.event_type ORDER BY day,e.sku,e.event_type`,params)).rows;
   const daily=Array.from({length:period.days},(_,i)=>({date:new Date(Date.parse(period.from)+i*86400000).toISOString().slice(0,10),...blank()}));
   const products=new Map<string,Counters&{sku:string;name:string;category:string|null}>(),summary=blank();
   const get=(sku:string,name:string,category:string|null)=>{let p=products.get(sku);if(!p){p={sku,name,category,...blank()};products.set(sku,p);}return p;};
   const orders=new Map<string,{day:string;paid:boolean;cancelled:boolean;refundMinor:number;unknownRefund:boolean}>();
   for(const line of lines){
    const p=get(line.sku,line.name,line.category),d=daily.find(d=>d.date===line.day)!;
    const amount=line.paid?safe(line.line_minor):0,units=line.paid?safe(line.quantity):0,returned=safe(line.returned_units),refunded=line.returned_minor===null?null:safe(line.returned_minor);
    for(const r of [p,d,summary]){r.salesMinor+=amount;r.units+=units;r.returnedUnits+=returned;r.returnedMinor=r.returnedMinor===null||refunded===null?null:r.returnedMinor+refunded;}
    p.orders++;p.paidOrders+=Number(line.paid);p.cancelled+=Number(line.status==='cancelled');
    orders.set(line.id,{day:line.day,paid:line.paid,cancelled:line.status==='cancelled',refundMinor:safe(line.refund_minor),unknownRefund:['partially_refunded','refunded'].includes(line.payment_status)&&safe(line.refund_minor)===0});
   }
   for(const order of orders.values())for(const r of [summary,daily.find(d=>d.date===order.day)!]){r.orders++;r.paidOrders+=Number(order.paid);r.cancelled+=Number(order.cancelled);}
   const fields={product_impression:'impressions',product_open:'opens',product_click:'clicks',add_to_cart:'adds',checkout_started:'checkouts'} as const;
   for(const e of traffic){const p=get(e.sku,e.name,e.category),key=fields[e.event_type as keyof typeof fields];for(const r of [summary,p,daily.find(d=>d.date===e.day)!])r[key]+=safe(e.n);}
   for(const r of [summary,...products.values(),...daily])for(const v of Object.values(r))if(typeof v==='number')safe(v);
   const rows=[...products.values()].sort((a,b)=>b.salesMinor-a.salesMinor||(a.sku<b.sku?-1:1)).map(enrichRow=>({...enrichRow,...enrich(enrichRow)}));
   const confirmedRefundMinor=[...orders.values()].reduce((n,o)=>n+o.refundMinor,0);safe(confirmedRefundMinor);
   return {period,timezone:'Europe/Moscow',generatedAt:now.toISOString(),basis:'order_created_cohort' as const,summary:enrich(summary),daily,products:rows,
    quality:{unknownRefundOrders:[...orders.values()].filter(o=>o.unknownRefund).length,confirmedRefundMinor,
     refundAllocationIncomplete:summary.returnedMinor===null,unknownCategory:rows.some(p=>p.category===null)},
    eventCoverageStart:(await tx.query('SELECT min(occurred_at) AS start FROM product_analytics_events')).rows[0].start};
  });
 }
}
