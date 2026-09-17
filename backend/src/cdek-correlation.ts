import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {Database,lock,type Tx} from './db.js';
import {DomainError,canonical} from './core.js';
import type {CdekStatusGateway} from './order-tracking.js';
const scopeSchema=z.object({ycpAccountId:z.string().min(1).max(100),deliveryAccountId:z.string().min(1).max(100),environment:z.enum(['test','production'])}).strict();
type Scope=z.infer<typeof scopeSchema>;
// Operator-assisted first binding only. No phone/cart matching and no remote writes.
// Automatic discovery stays off until real Yandex-created shipment evidence exists.
export class CdekCorrelation {
 private scope:Scope;
 constructor(private db:Database,private api:CdekStatusGateway,scope:Scope){this.scope=scopeSchema.parse(scope);}
 private async order(query:Pick<Tx,'query'>,id:string,forUpdate=false){
  const s=this.scope;
  const row=(await query.query(`SELECT o.public_number FROM orders o JOIN ycp_sessions y ON y.order_id=o.id
   WHERE o.id=$1 AND y.account_id=$2 AND y.environment=$3 AND y.placement_outcome='placed'
   AND o.status IN ('placed','processing','completed')
   AND o.delivery_snapshot->'ycp'->>'service_type'='cdek'
   ${forUpdate?'FOR UPDATE OF o,y':''}`,[id,s.ycpAccountId,s.environment])).rows[0];
  if(!row)throw new DomainError('CDEK_CORRELATION_ORDER_NOT_READY',409);
  return row.public_number as string;
 }
 async verify(orderId:string,trackingNumber:string){
  z.uuid().parse(orderId);z.string().regex(/^\d{5,30}$/).parse(trackingNumber);
  const internalNumber=await this.order(this.db.pool,orderId);
  const response=await this.api.order({trackingNumber});
  if(response.trackingNumber!==trackingNumber||!z.uuid().safeParse(response.uuid).success||response.clientOrderNumber!==internalNumber)throw new DomainError('CDEK_CLIENT_NUMBER_MISMATCH',409);
  return {orderId,internalNumber,cdekUuid:response.uuid,trackingNumber,correlationField:'entity.number' as const};
 }
 async bind(orderId:string,trackingNumber:string,confirmedClientNumber:string){
  const proof=await this.verify(orderId,trackingNumber),s=this.scope;
  if(confirmedClientNumber!==proof.internalNumber)throw new DomainError('CDEK_CORRELATION_CONFIRMATION_REQUIRED',409);
  return this.db.transaction(async tx=>{
   await lock(tx,canonical(['cdek-bind',s.deliveryAccountId,s.environment,proof.cdekUuid]));
   await lock(tx,canonical(['cdek-bind-number',s.deliveryAccountId,s.environment,proof.trackingNumber]));
   if(await this.order(tx,orderId,true)!==proof.internalNumber)throw new DomainError('CDEK_CLIENT_NUMBER_MISMATCH',409);
   const prior=(await tx.query('SELECT * FROM order_logistics WHERE order_id=$1 FOR UPDATE',[orderId])).rows[0];
   if(prior&&(prior.account_id!==s.deliveryAccountId||prior.environment!==s.environment||prior.cdek_uuid&&prior.cdek_uuid!==proof.cdekUuid||prior.tracking_number&&prior.tracking_number!==proof.trackingNumber))throw new DomainError('CDEK_BINDING_CONFLICT',409);
   if((await tx.query('SELECT 1 FROM order_logistics WHERE order_id<>$1 AND account_id=$2 AND environment=$3 AND (cdek_uuid=$4 OR tracking_number=$5)',[orderId,s.deliveryAccountId,s.environment,proof.cdekUuid,proof.trackingNumber])).rowCount)throw new DomainError('CDEK_BINDING_CONFLICT',409);
   if(prior?.cdek_uuid===proof.cdekUuid&&prior.tracking_number===proof.trackingNumber)return {...proof,alreadyBound:true};
   await tx.query(`INSERT INTO order_logistics(order_id,account_id,environment,cdek_uuid,tracking_number,delivery_requested_at)
    VALUES($1,$2,$3,$4,$5,now()) ON CONFLICT(order_id) DO UPDATE SET cdek_uuid=excluded.cdek_uuid,tracking_number=excluded.tracking_number,delivery_requested_at=excluded.delivery_requested_at`,[orderId,s.deliveryAccountId,s.environment,proof.cdekUuid,proof.trackingNumber]);
   await tx.query("INSERT INTO audit_log(id,action,entity_id,detail) VALUES($1,'cdek.correlation_verified',$2,$3)",[randomUUID(),orderId,JSON.stringify({...proof,...s,verification:'authenticated_get_and_operator_confirmation'})]);
   return {...proof,alreadyBound:false};
  });
 }
}
