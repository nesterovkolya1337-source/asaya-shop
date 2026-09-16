import {Database} from './db.js';
import {mac} from './core.js';
import {ycpSettingsSchema} from './ycp-catalog.js';
const object=(v:unknown):Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
const identifier=(v:unknown)=>typeof v==='string'&&v.length>0&&v.length<=200?v:null;
export class YcpRequestTrace{
 private settings;
 constructor(private db:Database,settings:unknown,private secret:string){this.settings=ycpSettingsSchema.parse(settings);}
 async resolve(route:string,body:unknown,query:unknown):Promise<{orderId?:string;correlation?:'matched'|'unmatched'|'unavailable';ycpReference?:string;ycpReferenceKind?:string}>{
  route=route.replace(/^\/api\/v1\//,'/api/ycp/v1/');
  const b=object(body),q=object(query),s=this.settings;
  let session:string|null=null,external:string|null=null;
  if(route==='/api/ycp/v1/checkout'||route==='/api/ycp/v1/checkout/placed')session=identifier(b.session_id);
  if(route==='/api/ycp/v1/checkout/cancel')session=identifier(q.session_id);
  if(['/api/ycp/v1/order','/api/ycp/v1/order/delivered','/api/ycp/v1/order/cancel'].includes(route))external=identifier(q.order_id);
  if(!session&&!external)return {};
  // Incoming identifiers may themselves contain private data. Log keyed references, never raw input.
  const reference={ycpReference:mac(this.secret,JSON.stringify([s.accountId,s.environment,session?'session':'order',session??external])),ycpReferenceKind:session?'session':'order'};
  try{
   const row=(await this.db.pool.query(`SELECT order_id FROM ycp_sessions WHERE account_id=$1 AND environment=$2
    AND (($3::text IS NOT NULL AND session_id=$3) OR ($4::text IS NOT NULL AND external_order_id=$4))`,[s.accountId,s.environment,session,external])).rows[0];
   return {...reference,...(row?{orderId:row.order_id}:{}),correlation:row?'matched':'unmatched'};
  }catch{return {...reference,correlation:'unavailable'};}
 }
}
