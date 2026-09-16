import {z} from 'zod';
import {DomainError,hash} from './core.js';

export interface CdekSubscriptionGateway {
 subscriptions():Promise<Array<{uuid:string;type:string;url:string}>>;
 createOrderStatusSubscription(callback:string):Promise<{uuid:string}>;
}
const bindingSchema=z.object({account:z.string().min(1).max(100),environment:z.enum(['test','production']),origin:z.url(),secret:z.string().regex(/^[A-Za-z0-9_-]{32,256}$/)}).strict();
export type CdekWebhookBinding=z.infer<typeof bindingSchema>;
const stateSchema=z.object({bindingHash:z.string().regex(/^[a-f0-9]{64}$/),phase:z.enum(['pending','active']),uuid:z.uuid().optional()}).strict();
export type CdekWebhookSetupState=z.infer<typeof stateSchema>;
export interface CdekWebhookSetupStore {
 read():Promise<unknown>;
 save(state:CdekWebhookSetupState):Promise<void>;
}
export function cdekWebhookCallback(raw:CdekWebhookBinding){
 const b=bindingSchema.parse(raw),u=new URL(b.origin);
 if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.pathname!=='/'||u.hostname==='localhost'||u.hostname==='127.0.0.1')throw new DomainError('CDEK_CALLBACK_INVALID',400);
 return u.origin+'/api/integrations/cdek/'+b.secret;
}

// The caller holds one database advisory lock for this CDEK account/environment.
// State is written durably BEFORE POST: a lost response never triggers another POST.
export async function setupCdekWebhook(api:CdekSubscriptionGateway,store:CdekWebhookSetupStore,binding:CdekWebhookBinding,mode:'status'|'ensure'){
 if(!['status','ensure'].includes(mode))throw new DomainError('CDEK_SETUP_MODE_INVALID',400);
 const callback=cdekWebhookCallback(binding),bindingHash=hash(JSON.stringify([binding.account,binding.environment,callback]));
 const saved=await store.read();
 const state=saved===undefined?undefined:stateSchema.parse(saved);
 if(state&&state.bindingHash!==bindingHash)throw new DomainError('CDEK_SUBSCRIPTION_BINDING_CHANGED');
 const list=await api.subscriptions();
 const exact=list.filter(s=>s.type==='ORDER_STATUS'&&s.url===callback);
 if(exact.length>1)throw new DomainError('CDEK_SUBSCRIPTION_DUPLICATE');
 if(exact.length===1){
  const uuid=exact[0]!.uuid;
  if(mode==='ensure')await store.save({bindingHash,phase:'active',uuid});
  return {status:'active' as const,uuid,created:false};
 }
 if(state)return {status:'requires_review' as const,created:null};
 if(mode==='status')return {status:'missing' as const,created:false};
 // Existing subscriptions belong to other integrations; never replace/delete them.
 if(list.filter(s=>s.type==='ORDER_STATUS').length>=2)throw new DomainError('CDEK_SUBSCRIPTION_LIMIT');
 await store.save({bindingHash,phase:'pending'});
 try{await api.createOrderStatusSubscription(callback);}catch{return {status:'requires_review' as const,created:null};}
 const active=(await api.subscriptions()).filter(s=>s.type==='ORDER_STATUS'&&s.url===callback);
 if(active.length>1)throw new DomainError('CDEK_SUBSCRIPTION_DUPLICATE');
 if(active.length!==1)return {status:'requires_review' as const,created:null};
 const uuid=active[0]!.uuid;
 await store.save({bindingHash,phase:'active',uuid});
 return {status:'active' as const,uuid,created:true};
}
