import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createProductAnalytics,observeProductImpression,PRODUCT_ANALYTICS_KEY} from '../src/lib/product-analytics.ts';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
 const values=new Map(),sent=[];let allowed=true,now=1000000,success=true;
 const options={storage:{getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)},uuid:randomUUID,now:()=>now,allowed:()=>allowed,send:async payload=>{sent.push(structuredClone(payload));return success;}};
 return {values,sent,options,runtime:createProductAnalytics(options),consent:v=>allowed=v,advance:n=>now+=n,succeed:v=>success=v};
}
test('anonymous events require consent; repeated render, refresh and retries keep one session/SKU/action',async()=>{
 const f=fixture();f.consent(false);assert.equal(f.runtime.track('product_open','A'),false);assert.equal(f.sent.length,0);assert.equal(f.values.size,0);
 f.consent(true);assert.equal(f.runtime.track('product_open','A'),true);await tick();assert.equal(f.runtime.track('product_open','A'),false);await tick();assert.equal(f.sent.length,1);
 const restored=createProductAnalytics(f.options);assert.equal(restored.track('product_open','A'),false);await tick();assert.equal(f.sent.length,1);
 f.succeed(false);restored.track('add_to_cart','A');await tick();const failed=f.sent.at(-1);assert.equal(failed.events[0].type,'add_to_cart');
 f.succeed(true);const retry=createProductAnalytics(f.options);await retry.flush();assert.deepEqual(f.sent.at(-1),failed);
 assert.deepEqual(Object.keys(f.sent[0]).sort(),['anonymousSessionId','events']);assert.deepEqual(Object.keys(f.sent[0].events[0]).sort(),['eventId','sku','type']);
 const original=f.sent[0].anonymousSessionId;f.advance(1800001);retry.track('product_open','A');await tick();assert.notEqual(f.sent.at(-1).anonymousSessionId,original);
 f.consent(false);await retry.flush();assert.equal(f.values.has(PRODUCT_ANALYTICS_KEY),false);
});
test('collector failures and blocked session storage do not break user actions or leak stored arbitrary data',async()=>{
 const f=fixture();f.options.send=async()=>{throw Error('offline');};const runtime=createProductAnalytics(f.options);assert.doesNotThrow(()=>runtime.track('checkout_started','A'));await runtime.flush();
 const record=JSON.parse(f.values.get(PRODUCT_ANALYTICS_KEY));record.phone='PRIVATE_PHONE';record.pending[0].email='PRIVATE_EMAIL';f.values.set(PRODUCT_ANALYTICS_KEY,JSON.stringify(record));
 const sent=[];await createProductAnalytics({...f.options,send:async p=>{sent.push(p);return true;}}).flush();assert.ok(!JSON.stringify(sent).includes('PRIVATE'));
 const throwing={getItem:()=>{throw Error('blocked');},setItem:()=>{throw Error('blocked');},removeItem:()=>{throw Error('blocked');}};
 const privateRuntime=createProductAnalytics({...f.options,storage:throwing});assert.doesNotThrow(()=>privateRuntime.track('product_impression','A'));await privateRuntime.flush();
 assert.equal(privateRuntime.track('order_paid','A'),false);assert.equal(privateRuntime.track('product_open'),false);
});

test('page initialization flush cannot strand an immediate product view; a new session drains after an in-flight request',async()=>{
 const f=fixture();void f.runtime.flush();f.runtime.track('product_open','A');await tick();assert.equal(f.sent.length,1);
 let release;f.options.send=payload=>{f.sent.push(structuredClone(payload));return new Promise(r=>release=r);};
 f.runtime.track('add_to_cart','A');f.advance(1800001);f.runtime.track('product_open','B');
 f.options.send=async payload=>{f.sent.push(structuredClone(payload));return true;};release(true);await tick();
 assert.equal(f.sent.at(-1).events[0].sku,'B');assert.notEqual(f.sent[1].anonymousSessionId,f.sent[2].anonymousSessionId);
});

test('private pages suppress collection without resetting the anonymous session on returning to the store',async()=>{
 const f=fixture();let enabled=true;f.options.enabled=()=>enabled;
 f.runtime.track('product_open','A');await tick();enabled=false;
 await f.runtime.flush();assert.equal(f.runtime.track('product_open','B'),false);assert.equal(f.sent.length,1);assert.ok(f.values.has(PRODUCT_ANALYTICS_KEY));
 enabled=true;assert.equal(f.runtime.track('product_open','A'),false);await tick();assert.equal(f.sent.length,1);
});
function visibility(){
 let now=0,id=0,callback,listener,disconnected=false;const timers=new Map(),element={},doc={hidden:false,addEventListener:(name,fn)=>listener=fn,removeEventListener:()=>listener=undefined};
 class Observer{constructor(fn,options){callback=fn;assert.deepEqual(options.threshold,[0,.5,1]);}observe(target){assert.equal(target,element);}disconnect(){disconnected=true;}}
 const env={observer:Observer,document:doc,setTimeout:(fn,delay)=>{timers.set(++id,{fn,at:now+delay});return id;},clearTimeout:id=>timers.delete(id)};
 return {element,env,ratio:n=>callback([{target:element,isIntersecting:n>0,intersectionRatio:n}]),hidden:value=>{doc.hidden=value;listener?.();},advance:n=>{now+=n;for(const [id,t] of [...timers])if(t.at<=now){timers.delete(id);t.fn();}},timers,disconnected:()=>disconnected};
}
test('impressions need continuous >=50% for 1000ms, reject scroll fragments and fire once',()=>{
 const v=visibility();let count=0;const dispose=observeProductImpression(v.element,()=>count++,v.env);
 v.ratio(.49);v.advance(2000);assert.equal(count,0);
 v.ratio(.5);v.advance(999);assert.equal(count,0);v.ratio(.4);v.advance(5000);assert.equal(count,0);
 v.ratio(.7);v.advance(600);v.ratio(.9);v.advance(400);assert.equal(count,1);
 v.ratio(0);v.ratio(1);v.advance(5000);assert.equal(count,1);dispose();assert.equal(v.disconnected(),true);
});
test('hidden tabs and unmounted cards cancel the impression timer',()=>{
 const v=visibility();let count=0;const dispose=observeProductImpression(v.element,()=>count++,v.env);
 v.ratio(1);v.advance(500);v.hidden(true);v.advance(2000);assert.equal(count,0);v.hidden(false);v.advance(999);assert.equal(count,0);dispose();v.advance(2000);assert.equal(count,0);assert.equal(v.timers.size,0);
});
