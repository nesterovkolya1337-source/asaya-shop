import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CdekDeliveryClient} from '../src/cdek-delivery.js';
import {setupCdekWebhook,cdekWebhookCallback,type CdekWebhookBinding,type CdekWebhookSetupState,type CdekSubscriptionGateway} from '../src/cdek-webhook-setup.js';

const binding:CdekWebhookBinding={account:'test-contract',environment:'test',origin:'https://asaya.example.test',secret:'test-callback-secret-'.repeat(3)};
const uuid='dd71e526-d850-46db-97db-164391414c5b';
const exact={uuid,type:'ORDER_STATUS',url:cdekWebhookCallback(binding)};
function fixture(){
 let state:CdekWebhookSetupState|undefined;let saves=0,posts=0,reads=0;
 let list:Array<{uuid:string;type:string;url:string}>=[];
 const store={async read(){return state;},async save(value:CdekWebhookSetupState){saves++;state=structuredClone(value);}};
 const api:CdekSubscriptionGateway={async subscriptions(){reads++;return list;},async createOrderStatusSubscription(url){posts++;assert.equal(state?.phase,'pending');assert.equal(url,exact.url);list=[...list,exact];return {uuid};}};
 return {api,store,setList(value:typeof list){list=value;},get state(){return state;},get saves(){return saves;},get posts(){return posts;},get reads(){return reads;}};
}

test('CDEK setup status is read-only; an existing subscription is reused and never registered twice',async()=>{
 const f=fixture();
 assert.deepEqual(await setupCdekWebhook(f.api,f.store,binding,'status'),{status:'missing',created:false});
 assert.equal(f.saves,0);assert.equal(f.posts,0);
 f.setList([exact]);
 const found=await setupCdekWebhook(f.api,f.store,binding,'status');
 assert.deepEqual(found,{status:'active',uuid,created:false});assert.equal(f.saves,0);
 await setupCdekWebhook(f.api,f.store,binding,'ensure');
 assert.equal(f.posts,0);assert.equal(f.state?.phase,'active');
 assert.ok(!JSON.stringify(found).includes(binding.secret));
});

test('CDEK setup saves intent before one POST and verifies the active list before reporting success',async()=>{
 const f=fixture();
 const result=await setupCdekWebhook(f.api,f.store,binding,'ensure');
 assert.deepEqual(result,{status:'active',uuid,created:true});assert.equal(f.posts,1);assert.equal(f.reads,2);assert.equal(f.saves,2);
 assert.equal(f.state?.uuid,uuid);assert.ok(!JSON.stringify(f.state).includes(binding.secret));
 await setupCdekWebhook(f.api,f.store,binding,'ensure');assert.equal(f.posts,1);
});

test('CDEK setup never retries ambiguous creation; a later list can recover the accepted subscription',async()=>{
 const f=fixture();let attempts=0;
 f.api.createOrderStatusSubscription=async()=>{attempts++;throw new Error('lost provider response');};
 assert.equal((await setupCdekWebhook(f.api,f.store,binding,'ensure')).status,'requires_review');
 assert.equal(f.state?.phase,'pending');
 assert.equal((await setupCdekWebhook(f.api,f.store,binding,'ensure')).created,null);assert.equal(attempts,1);
 f.setList([exact]);
 assert.equal((await setupCdekWebhook(f.api,f.store,binding,'ensure')).status,'active');assert.equal(attempts,1);
});

test('CDEK setup preserves intent when read-back fails or accepted subscription is not visible yet',async()=>{
 const f=fixture();let reads=0;
 f.api.subscriptions=async()=>{if(++reads===1)return [];throw new Error('temporary outage');};
 await assert.rejects(setupCdekWebhook(f.api,f.store,binding,'ensure'));
 assert.equal(f.state?.phase,'pending');assert.equal(f.posts,1);
 f.api.subscriptions=async()=>[];
 assert.equal((await setupCdekWebhook(f.api,f.store,binding,'ensure')).status,'requires_review');assert.equal(f.posts,1);
 const g=fixture();g.api.createOrderStatusSubscription=async()=>({uuid});
 assert.equal((await setupCdekWebhook(g.api,g.store,binding,'ensure')).status,'requires_review');
 assert.equal(g.state?.phase,'pending');
});

test('CDEK setup refuses duplicates, exhausted slots and changed account, environment or callback bindings',async()=>{
 const f=fixture();f.setList([exact,{...exact,uuid:'ca024a7e-9f6e-45bc-9a47-4b0a0934db90'}]);
 await assert.rejects(setupCdekWebhook(f.api,f.store,binding,'ensure'),/CDEK_SUBSCRIPTION_DUPLICATE/);assert.equal(f.posts,0);
 f.setList([{...exact,type:'PRINT_FORM',url:'https://other.example.test/one'},{...exact,type:'ORDER_MODIFIED',url:'https://other.example.test/two'}]);
 await assert.rejects(setupCdekWebhook(f.api,f.store,binding,'ensure'),/CDEK_SUBSCRIPTION_LIMIT/);assert.equal(f.posts,0);assert.equal(f.saves,0);
 f.setList([]);await setupCdekWebhook(f.api,f.store,binding,'ensure');
 for(const changed of [{...binding,account:'other'},{...binding,environment:'production' as const},{...binding,secret:'different-secret-'.repeat(3)}]){
  await assert.rejects(setupCdekWebhook(f.api,f.store,changed,'ensure'),/CDEK_SUBSCRIPTION_BINDING_CHANGED/);
 }
 assert.equal(f.posts,1);
});

test('CDEK setup requires readable durable state and successful listing before any mutation',async()=>{
 const f=fixture();f.store.save=async()=>{throw new Error('disk full');};
 await assert.rejects(setupCdekWebhook(f.api,f.store,binding,'ensure'),/disk full/);assert.equal(f.posts,0);
 const g=fixture();g.api.subscriptions=async()=>{throw new Error('unauthorized');};
 await assert.rejects(setupCdekWebhook(g.api,g.store,binding,'ensure'),/unauthorized/);assert.equal(g.posts,0);assert.equal(g.saves,0);
});

test('CDEK callback rejects insecure URLs, credential-bearing origins and short secrets',()=>{
 for(const origin of ['http://asaya.example.test','https://name:password@asaya.example.test','https://asaya.example.test/path','https://asaya.example.test/?secret=x','https://asaya.example.test/#hash'])assert.throws(()=>cdekWebhookCallback({...binding,origin}));
 assert.throws(()=>cdekWebhookCallback({...binding,secret:'short'}));
});

test('CDEK subscription transport only registers ORDER_STATUS, never follows redirects or leaks provider errors',async()=>{
 const requests:string[]=[];
 const client=new CdekDeliveryClient({account:'test-contract',clientId:'client',clientSecret:'secret',environment:'test'},async(url,init)=>{
  const u=new URL(String(url));requests.push(u.pathname);assert.equal(u.origin,'https://api.edu.cdek.ru');assert.equal(init?.redirect,'error');
  if(u.pathname==='/v2/oauth/token')return Response.json({access_token:'private-token',expires_in:3600,token_type:'bearer'});
  assert.equal(u.pathname,'/v2/webhooks');assert.equal(init?.method,'POST');
  assert.deepEqual(JSON.parse(String(init?.body)),{type:'ORDER_STATUS',url:exact.url});
  assert.equal((init?.headers as Record<string,string>).authorization,'Bearer private-token');
  return Response.json({entity:{uuid},requests:[{state:'ACCEPTED'}]});
 });
 assert.deepEqual(await client.createOrderStatusSubscription(exact.url),{uuid});assert.deepEqual(requests,['/v2/oauth/token','/v2/webhooks']);
 const failed=new CdekDeliveryClient({account:'test-contract',clientId:'client',clientSecret:'secret',environment:'test'},async()=>{throw new Error('provider secret');});
 await assert.rejects(failed.createOrderStatusSubscription(exact.url),error=>error instanceof Error&&error.message==='CDEK_SUBSCRIPTION_UNCERTAIN');
});
