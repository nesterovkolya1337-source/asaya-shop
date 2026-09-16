import {AuthClientError,createStoreRequest} from './auth-client.ts';
import {reviewSignalLabels} from './admin-orders-client.ts';
export type Issue={id:string;createdAt:string;status:string;attempts:number;nextAttemptAt:string|null;kind:string;review:boolean;error:string|null;order:{id:string;number:string}|null;ycp:{sessionId:string;orderId:string|null}|null};
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const obj=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v))throw new AuthClientError('INVALID_RESPONSE');return v as Record<string,unknown>;};
const date=(v:unknown)=>typeof v==='string'&&Number.isFinite(Date.parse(v));
export function parseIssues(raw:unknown){
 const r=obj(raw);if(!Array.isArray(r.items)||r.items.length>20||!(r.nextCursor===null||typeof r.nextCursor==='string'&&uuid.test(r.nextCursor)))throw new AuthClientError('INVALID_RESPONSE');
 const items=r.items.map(v=>{const i=obj(v);
 if(typeof i.id!=='string'||!uuid.test(i.id)||!date(i.createdAt)||!['pending','processing','done','failed'].includes(String(i.status))||!Number.isSafeInteger(i.attempts)||Number(i.attempts)<0||!(i.nextAttemptAt===null||date(i.nextAttemptAt))||typeof i.kind!=='string'||!(i.kind==='integration.event'||Object.hasOwn(reviewSignalLabels,i.kind))||typeof i.review!=='boolean'||!(i.error===null||i.error==='HANDLER_FAILED'))throw new AuthClientError('INVALID_RESPONSE');
 let order:Issue['order']=null,ycp:Issue['ycp']=null;
 if(i.order!==null){const o=obj(i.order);if(typeof o.id!=='string'||!uuid.test(o.id)||typeof o.number!=='string'||!o.number||o.number.length>200)throw new AuthClientError('INVALID_RESPONSE');order={id:o.id,number:o.number};}
 if(i.ycp!==null){const y=obj(i.ycp);if(typeof y.sessionId!=='string'||!y.sessionId||y.sessionId.length>200||!(y.orderId===null||typeof y.orderId==='string'&&y.orderId.length<=200))throw new AuthClientError('INVALID_RESPONSE');ycp={sessionId:y.sessionId,orderId:y.orderId as string|null};}
 return {id:i.id,createdAt:i.createdAt,status:i.status,attempts:i.attempts,nextAttemptAt:i.nextAttemptAt,kind:i.kind,review:i.review,error:i.error,order,ycp} as Issue;
 });
 if(new Set(items.map(i=>i.id)).size!==items.length||r.nextCursor!==null&&items.at(-1)?.id!==r.nextCursor)throw new AuthClientError('INVALID_RESPONSE');
 return {items,nextCursor:r.nextCursor as string|null};
}
export function createIntegrationClient(base:string,fetcher:typeof fetch=fetch){const request=createStoreRequest(base,fetcher);return {async list(filter='all',cursor?:string){const q=new URLSearchParams({filter});if(cursor)q.set('cursor',cursor);const r=parseIssues(await request('integration-issues?'+q,'GET'));if(cursor&&r.nextCursor===cursor)throw new AuthClientError('INVALID_RESPONSE');return r;}};}
