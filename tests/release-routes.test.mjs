import test from 'node:test';
import assert from 'node:assert/strict';
import config from '../next.config.ts';
test('accumulated Admin and customer features have same-origin API proxy routes', async()=>{
 const routes=await config.rewrites();
 for(const path of ['account/engagement','account/reviews','account/referral','reviews/:sku']){
  assert.ok(routes.some(r=>r.source==='/api/store/v1/'+path&&r.destination.endsWith('/api/store/v1/'+path)),path);
 }
 for(const path of ['marketing/reviews/:id','trash','trash/:kind/:id/restore','trash/:kind/:id/purge','media/:id/delete']){
  assert.ok(routes.some(r=>r.source==='/api/admin/v1/'+path&&r.destination.endsWith('/api/admin/v1/'+path)),path);
 }
});
test('profile entry redirects to the existing SMS dashboard',async()=>{
 const routes=await config.redirects();
 assert.deepEqual(routes.find(r=>r.source==='/profile'),{source:'/profile',destination:'/account/',permanent:false});
});
