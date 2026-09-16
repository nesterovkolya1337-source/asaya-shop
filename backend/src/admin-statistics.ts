import {z} from 'zod';
import {Database} from './db.js';
import {DomainError} from './core.js';

export class AdminStatistics{
 constructor(private db:Database,private clock=()=>new Date()){}
 async get(actor:string,raw:unknown){
  if(!(await this.db.pool.query("SELECT 1 FROM users WHERE id=$1 AND role='admin' AND NOT disabled",[actor])).rowCount)throw new DomainError('FORBIDDEN',403);
  const {days}=z.object({days:z.enum(['7','30','90']).default('30')}).strict().parse(raw);
  const now=this.clock();
  const result=await this.db.pool.query(`WITH bounds AS (
   SELECT ($1::timestamptz AT TIME ZONE 'Europe/Moscow')::date AS today
  ), selected AS (
   SELECT o.*,COALESCE(i.units,0) AS units,
    (o.status IN ('placed','processing','completed') AND o.payment_status='paid' AND COALESCE(i.refused,0)=0
     AND NOT EXISTS(SELECT 1 FROM refunds r JOIN payments p ON p.id=r.payment_id WHERE p.order_id=o.id AND r.status='succeeded')) AS sale,
    (o.payment_status IN ('partially_refunded','refunded') OR COALESCE(i.refused,0)>0
     OR EXISTS(SELECT 1 FROM refunds r JOIN payments p ON p.id=r.payment_id WHERE p.order_id=o.id AND r.status='succeeded')) AS returned
   FROM orders o LEFT JOIN LATERAL(SELECT sum(quantity) units,sum(refused_count) refused FROM order_items WHERE order_id=o.id) i ON true,bounds b
   WHERE o.created_at >= ((b.today-($2::int-1))::timestamp AT TIME ZONE 'Europe/Moscow') AND o.created_at<=$1::timestamptz
  ), daily AS (
   SELECT d.day::date AS day,count(s.id)::int AS orders,
    COALESCE(sum(s.subtotal_minor) FILTER(WHERE s.sale),0) AS sales_minor,
    COALESCE(sum(s.units) FILTER(WHERE s.sale),0) AS units
   FROM bounds b CROSS JOIN LATERAL generate_series(b.today-($2::int-1),b.today,interval '1 day') d(day)
   LEFT JOIN selected s ON (s.created_at AT TIME ZONE 'Europe/Moscow')::date=d.day::date GROUP BY d.day
  ), top_products AS (
   SELECT i.sku,min(i.name_snapshot) AS name,sum(i.quantity) AS units,sum(i.line_minor) AS sales_minor
   FROM order_items i JOIN selected s ON s.id=i.order_id WHERE s.sale GROUP BY i.sku ORDER BY sum(i.line_minor) DESC,i.sku LIMIT 10
  ) SELECT jsonb_build_object(
   'days',$2::int,'timezone','Europe/Moscow','generatedAt',$1::timestamptz,
   'orders',(SELECT count(*) FROM selected),'paidOrders',(SELECT count(*) FROM selected WHERE sale),
   'cancelled',(SELECT count(*) FROM selected WHERE status='cancelled'),'returned',(SELECT count(*) FROM selected WHERE returned),
   'salesMinor',(SELECT COALESCE(sum(subtotal_minor),0) FROM selected WHERE sale),
   'units',(SELECT COALESCE(sum(units),0) FROM selected WHERE sale),
   'daily',(SELECT jsonb_agg(jsonb_build_object('date',day,'orders',orders,'salesMinor',sales_minor,'units',units) ORDER BY day) FROM daily),
   'topProducts',COALESCE((SELECT jsonb_agg(jsonb_build_object('sku',sku,'name',name,'units',units,'salesMinor',sales_minor) ORDER BY sales_minor DESC,sku) FROM top_products),'[]'::jsonb)
  ) AS stats`,[now,Number(days)]);
  return result.rows[0].stats;
 }
}
