import {z} from 'zod';

// Project only the saved delivery information belonging to this customer order.
// Do not expose the raw YCP snapshot or invent CDEK identifiers.
export function customerDelivery(raw:unknown){
 const data=z.object({label:z.string().max(5000).optional(),address:z.object({city:z.string().max(5000).optional(),address:z.string().max(5000).optional()}).optional()}).safeParse(raw);
 const base=data.success?data.data:{};
 const ycp=z.object({source:z.literal('ycp'),ycp:z.object({address:z.object({pickup_point_id:z.string().min(1).max(200).optional()}),delivery_date_interval:z.object({start_interval:z.object({date:z.iso.date()}),end_interval:z.object({date:z.iso.date()})})})}).safeParse(raw);
 const result={label:base.label??'',city:base.address?.city??'',address:base.address?.address??''};
 if(!ycp.success)return result;
 const {address,delivery_date_interval:dates}=ycp.data.ycp;
 return {...result,...(address.pickup_point_id?{pickupPoint:address.pickup_point_id}:{}),
  ...(dates.start_interval.date<=dates.end_interval.date?{plannedStart:dates.start_interval.date,plannedEnd:dates.end_interval.date}:{})};
}
