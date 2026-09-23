import {SMS_CONSENT_VERSION} from '../src/sms-consent-policy.js';
const smsConsent={accepted:true as const,version:SMS_CONSENT_VERSION} as const;
import {buildApp} from '../src/app.js';
import {AuthService,DisabledOtpSender} from '../src/auth.js';
import {StaffAuth} from '../src/staff-auth.js';
import {hash} from '../src/core.js';

import {before,after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {testDatabase} from './postgres.js';
import {Engagement,earnReferral} from '../src/engagement.js';
import {Trash} from '../src/trash.js';
import {AdminCatalog,emptyContent} from '../src/admin-catalog.js';
import {MediaService} from '../src/media.js';
let ctx:Awaited<ReturnType<typeof testDatabase>>;
before(async()=>{ctx=await testDatabase();});after(async()=>ctx?.stop());
beforeEach(async()=>{await ctx.db.pool.query('TRUNCATE users,products,customer_profiles CASCADE');await ctx.db.pool.query("UPDATE marketing_settings SET live=live-'replenishment'");});
async function buyer(phone:string){
 const user=randomUUID();await ctx.db.pool.query('INSERT INTO users(id) VALUES($1)',[user]);
 await ctx.db.pool.query("INSERT INTO user_identities(channel,destination,user_id,verified_at) VALUES('sms',$1,$2,now())",[phone,user]);
 const customer=(await ctx.db.pool.query('INSERT INTO customer_profiles(phone,user_id) VALUES($1,$2) RETURNING id',[phone,user])).rows[0].id;
 return {user,customer};
}
async function product(actor:string){
 const id=randomUUID();await ctx.db.pool.query("INSERT INTO products(id,sku,name) VALUES($1,$2,'Product')",[id,'SKU-'+id]);
 await ctx.db.pool.query('INSERT INTO product_editor(product_id,revision,draft,updated_by) VALUES($1,1,$2,$3)',[id,{sku:'SKU-'+id,name:'Product',content:emptyContent},actor]);return id;
}
async function fixture(){
 const actor=randomUUID();await ctx.db.pool.query("INSERT INTO users(id,role) VALUES($1,'admin')",[actor]);
 const a=await buyer('+79990000001'),b=await buyer('+79990000002'),p=await product(actor);
 return {actor,a,b,p,service:new Engagement(ctx.db),trash:new Trash(ctx.db),catalog:new AdminCatalog(ctx.db)};
}
async function order(b:{user:string;customer:string},p:string,paid=true){
 const id=randomUUID(),checkout=randomUUID();
 await ctx.db.pool.query("INSERT INTO checkout_sessions(id,user_id,status,snapshot,expires_at) VALUES($1,$2,'placed','{}',now()+interval '1 hour')",[checkout,b.user]);
 await ctx.db.pool.query(`INSERT INTO orders(id,public_number,checkout_id,user_id,customer_id,status,payment_status,delivery_status,currency,subtotal_minor,delivery_minor,total_minor,customer_snapshot,delivery_snapshot,consent_snapshot)
 VALUES($1::uuid,$1::text,$2,$3,$4,'placed',$5,'not_created','RUB',10000,0,10000,'{}','{}','{}')`,[id,checkout,b.user,b.customer,paid?'paid':'pending']);
 await ctx.db.pool.query("INSERT INTO order_items(order_id,product_id,sku,name_snapshot,quantity,unit_minor,line_minor) VALUES($1,$2,'SKU','Product',1,10000,10000)",[id,p]);
 if(paid)await ctx.db.pool.query("INSERT INTO payments(id,order_id,provider,account_id,environment,external_id,status,amount_minor,currency) VALUES($1,$2::uuid,'ycp','fixture','test',$2::text,'paid',10000,'RUB')",[randomUUID(),id]);
 return id;
}
const points=async(customer:string)=>Number((await ctx.db.pool.query('SELECT coalesce(sum(points),0) n FROM loyalty_ledger WHERE customer_id=$1',[customer])).rows[0].n);
test('verified negative review rewards once after moderation; hide/reply retain reward; duplicate and unverified cannot earn',async()=>{
 const f=await fixture();await assert.rejects(f.service.submit(f.b.user,{productId:f.p,rating:1,body:'Negative'}),/VERIFIED_PURCHASE/);
 await order(f.a,f.p);await ctx.db.pool.query('UPDATE products SET active=true WHERE id=$1',[f.p]);
 await f.service.submit(f.a.user,{productId:f.p,rating:1,body:'Negative review'});
 assert.equal(await points(f.a.customer),0);
 const r=(await f.service.reviews(f.actor)).items[0];
 await Promise.all([f.service.moderate(f.actor,r.id,{action:'show'}),f.service.moderate(f.actor,r.id,{action:'show'})]);
 assert.equal(await points(f.a.customer),100);
 assert.equal((await f.service.submit(f.a.user,{productId:f.p,rating:5,body:'Repeated'})).created,false);
 await f.service.moderate(f.actor,r.id,{action:'reply',reply:'Thank you'});
 assert.equal((await f.service.publicReviews('SKU-'+f.p)).items[0].reply,'Thank you');
 await f.service.moderate(f.actor,r.id,{action:'hide'});assert.equal(await points(f.a.customer),100);
 assert.equal((await f.service.publicReviews('SKU-'+f.p)).items.length,0);
});
for(const reason of ['spam','duplicate','abuse'])test('rejected '+reason+' does not earn review reward',async()=>{
 const f=await fixture();await order(f.a,f.p);await f.service.submit(f.a.user,{productId:f.p,rating:5,body:'Invalid'});
 await f.service.moderate(f.actor,(await f.service.reviews(f.actor)).items[0].id,{action:'reject',reason});assert.equal(await points(f.a.customer),0);
});
test('referral registration has no reward; first paid order credits inviter only, idempotently; self referral denied',async()=>{
 const f=await fixture(),code=(await f.service.account(f.a.user)).code;
 await assert.rejects(f.service.attach(f.a.user,{code}),/SELF_REFERRAL/);
 await f.service.attach(f.b.user,{code});await f.service.attach(f.b.user,{code});assert.equal(await points(f.a.customer),0);
 const unpaid=await order(f.b,f.p,false);await ctx.db.transaction(tx=>earnReferral(tx,unpaid));assert.equal(await points(f.a.customer),0);
 const paid=await order(f.b,f.p);await Promise.all(Array.from({length:4},()=>ctx.db.transaction(tx=>earnReferral(tx,paid))));
 assert.equal(await points(f.a.customer),200);assert.equal(await points(f.b.customer),0);
 const later=await order(f.b,f.p);await ctx.db.transaction(tx=>earnReferral(tx,later));assert.equal(await points(f.a.customer),200);
});
test('cancelled order cannot earn referral reward and existing buyer cannot attach referral',async()=>{
 const f=await fixture(),code=(await f.service.account(f.a.user)).code;await f.service.attach(f.b.user,{code});
 const paid=await order(f.b,f.p);await ctx.db.pool.query("UPDATE orders SET status='cancelled' WHERE id=$1",[paid]);await ctx.db.transaction(tx=>earnReferral(tx,paid));assert.equal(await points(f.a.customer),0);
 const other=await buyer('+79990000003');await order(other,f.p);await assert.rejects(f.service.attach(other.user,{code}),/NEW_CUSTOMER/);
});
test('replenishment supports disabled and intervals, resets after another confirmed purchase; no ledger reward',async()=>{
 const f=await fixture(),old=await order(f.a,f.p);await ctx.db.pool.query("UPDATE orders SET created_at=now()-interval '61 days' WHERE id=$1",[old]);
 await ctx.db.pool.query("UPDATE marketing_settings SET live=jsonb_set(live,'{replenishment}',$1)",[JSON.stringify({[f.p]:60})]);
 assert.equal((await f.service.account(f.a.user)).reminders.length,1);
 await ctx.db.pool.query("UPDATE marketing_settings SET live=jsonb_set(live,'{replenishment}',$1)",[JSON.stringify({[f.p]:0})]);assert.equal((await f.service.account(f.a.user)).reminders.length,0);
 await ctx.db.pool.query("UPDATE marketing_settings SET live=jsonb_set(live,'{replenishment}',$1)",[JSON.stringify({[f.p]:30})]);await order(f.a,f.p);
 assert.equal((await f.service.account(f.a.user)).reminders.length,0);assert.equal(await points(f.a.customer),0);
});
test('product delete is soft, rejects Published, disappears from Admin, restores Draft/Unpublished; purge requires confirmation',async()=>{
 const f=await fixture();await ctx.db.pool.query('UPDATE products SET active=true WHERE id=$1',[f.p]);
 await assert.rejects(f.catalog.remove(f.actor,f.p,{revision:1,confirmed:true,sku:'SKU-'+f.p}),/UNPUBLISH/);
 await ctx.db.pool.query('UPDATE products SET active=false WHERE id=$1',[f.p]);
 await f.catalog.remove(f.actor,f.p,{revision:1,confirmed:true,sku:'SKU-'+f.p});
 assert.equal((await f.catalog.list({})).items.length,0);assert.equal((await f.trash.list(f.actor)).items.length,1);
 await f.trash.restore(f.actor,'product',f.p);assert.equal((await f.catalog.detail(f.p)).lifecycle,'unpublished');
 await ctx.db.pool.query("UPDATE product_editor SET published=draft,published_at=now() WHERE product_id=$1",[f.p]);
 await f.catalog.remove(f.actor,f.p,{revision:2,confirmed:true,sku:'SKU-'+f.p});await f.trash.restore(f.actor,'product',f.p);
 assert.equal((await f.catalog.detail(f.p)).lifecycle,'unpublished');
 await f.catalog.remove(f.actor,f.p,{revision:3,confirmed:true,sku:'SKU-'+f.p});
 await assert.rejects(f.trash.purge(f.actor,'product',f.p,{}));
 await assert.rejects(f.trash.purge(f.actor,'product',f.p,{confirmed:true}),/PRODUCT_EVER_PUBLISHED/);
 assert.equal((await f.catalog.detail(f.p)).lifecycle,'archived');
 await ctx.db.pool.query("UPDATE products SET archived_at=now()-interval '60 days',ever_published=false WHERE id=$1",[f.p]);
 await ctx.db.pool.query('UPDATE product_editor SET published=NULL,published_at=NULL WHERE product_id=$1',[f.p]);
 assert.equal((await ctx.db.pool.query('SELECT ever_published FROM products WHERE id=$1',[f.p])).rows[0].ever_published,true);
 await assert.rejects(ctx.db.pool.query('DELETE FROM products WHERE id=$1',[f.p]),/PRODUCT_EVER_PUBLISHED/);
 assert.equal(await f.trash.cleanup(),0);
 const archived=(await f.trash.list(f.actor)).items.find(i=>i.id===f.p);assert.equal(archived.days_left,null);
 await f.trash.restore(f.actor,'product',f.p);assert.equal((await f.catalog.detail(f.p)).lifecycle,'unpublished');
 const never=await product(f.actor);await f.catalog.remove(f.actor,never,{revision:1,confirmed:true,sku:'SKU-'+never});
 await f.trash.restore(f.actor,'product',never);assert.equal((await f.catalog.detail(never)).lifecycle,'draft');
 await f.catalog.remove(f.actor,never,{revision:2,confirmed:true,sku:'SKU-'+never});
 await f.trash.purge(f.actor,'product',never,{confirmed:true});await f.trash.purge(f.actor,'product',never,{confirmed:true});
 assert.equal((await ctx.db.pool.query('SELECT 1 FROM products WHERE id=$1',[never])).rowCount,0);
});
test('retention cleanup does not purge early, is idempotent and preserves transactional history',async()=>{
 const f=await fixture(),historic=await product(f.actor);await order(f.a,historic);
 for(const id of [f.p,historic])await f.catalog.remove(f.actor,id,{revision:1,confirmed:true,sku:'SKU-'+id});
 assert.equal(await f.trash.cleanup(),0);await ctx.db.pool.query("UPDATE products SET archived_at=now()-interval '31 days'");
 assert.equal(await f.trash.cleanup(),1);assert.equal(await f.trash.cleanup(),0);
 assert.equal((await ctx.db.pool.query('SELECT 1 FROM order_items WHERE product_id=$1',[historic])).rowCount,1);
});
test('media retains bytes until purge; references block deletion/purge; restore and 30-day cleanup',async()=>{
 const f=await fixture(),id=randomUUID();
 await ctx.db.pool.query("INSERT INTO product_media(id,uploader_id,source_hash,content_hash,content,width,height) VALUES($1,$2,'fixture','fixture',$3,1,1)",[id,f.actor,Buffer.from('fixture')]);
 await ctx.db.pool.query("UPDATE product_editor SET draft=jsonb_set(draft,'{content,image}',to_jsonb($2::text)) WHERE product_id=$1",[f.p,'/api/store/v1/media/'+id]);
 await assert.rejects(f.trash.deleteMedia(f.actor,id),/ASSET_IN_USE/);
 await f.catalog.remove(f.actor,f.p,{revision:1,confirmed:true,sku:'SKU-'+f.p});await f.trash.deleteMedia(f.actor,id);
 assert.equal((await ctx.db.pool.query('SELECT octet_length(content) n FROM product_media WHERE id=$1',[id])).rows[0].n,7);
 await assert.rejects(new MediaService(ctx.db).get(id),/MEDIA_NOT_FOUND/);await f.trash.restore(f.actor,'media',id);assert.equal((await new MediaService(ctx.db).get(id)).content.length,7);
 await f.trash.deleteMedia(f.actor,id);await f.trash.restore(f.actor,'product',f.p);await assert.rejects(f.trash.purge(f.actor,'media',id,{confirmed:true}),/ASSET_IN_USE/);
 await ctx.db.pool.query("UPDATE product_editor SET draft=jsonb_set(draft,'{content,image}',$2::jsonb) WHERE product_id=$1",[f.p,JSON.stringify('')]);
 assert.equal(await f.trash.cleanup(),0);
 await ctx.db.pool.query("UPDATE product_media SET deleted_at=now()-interval '31 days' WHERE id=$1",[id]);
 assert.equal(await f.trash.cleanup(),1);assert.equal(await f.trash.cleanup(),0);
 assert.equal((await ctx.db.pool.query('SELECT 1 FROM product_media WHERE id=$1',[id])).rowCount,0);
});

test('HTTP customer and manager flows enforce identity/CSRF and are allowed in catalog and YCP modes',async()=>{
 const f=await fixture(),origin='https://asaya.example.test',secret='engagement-test-secret-with-32-characters';
 await order(f.a,f.p);
 const staff=new StaffAuth(ctx.db,secret),staffId=await staff.provision('reviews@example.test','Test-password-123456','GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'),staffToken='a'.repeat(64);
 await ctx.db.pool.query("UPDATE staff_credentials SET staff_role='manager' WHERE user_id=$1",[staffId]);
 await ctx.db.pool.query("INSERT INTO staff_sessions(token_hash,user_id,created_at,expires_at) VALUES($1,$2,now(),now()+interval '1 hour')",[hash(staffToken),staffId]);
 const staffCsrf=(await staff.session(staffToken)).csrfToken;
 let code='';const auth=new AuthService(ctx.db,secret,{sendOtp:async(input)=>{code=input.code;}});
 const challenge=await auth.request('sms','+79990000001','127.0.0.1',smsConsent);const session=await auth.verify(challenge.challengeId,code,'127.0.0.1');
 for(const deploymentMode of ['catalog','ycp'] as const){
  const app=await buildApp({db:ctx.db,deploymentMode,origin,staffSecret:secret,otpSecret:secret,otpSender:{sendOtp:async()=>{}},customerSmsEnabled:true,secureCookies:true,...(deploymentMode==='ycp'?{ycp:{token:'x'.repeat(40),settings:{accountId:'fixture',environment:'production',publicOrigin:origin,warehouses:[]}}}:{})});
  try{
   const customerHeaders={origin,cookie:'__Host-asaya_session='+session.token,'x-csrf-token':session.csrf};
   assert.equal((await app.inject({url:'/api/store/v1/account/engagement'})).statusCode,401);
   assert.equal((await app.inject({url:'/api/store/v1/account/engagement',headers:customerHeaders})).statusCode,200);
   const payload={productId:f.p,rating:1,body:'Verified customer'};
   assert.equal((await app.inject({method:'POST',url:'/api/store/v1/account/reviews',headers:{origin,cookie:customerHeaders.cookie},payload})).statusCode,403);
   assert.equal((await app.inject({method:'POST',url:'/api/store/v1/account/reviews',headers:customerHeaders,payload})).statusCode,200);
   const adminHeaders={origin,cookie:'__Host-asaya_staff='+staffToken,'x-csrf-token':staffCsrf};
   assert.equal((await app.inject({url:'/api/admin/v1/marketing/reviews',headers:customerHeaders})).statusCode,401);
   const reviews=await app.inject({url:'/api/admin/v1/marketing/reviews',headers:adminHeaders});assert.equal(reviews.statusCode,200);
   assert.equal((await app.inject({method:'POST',url:'/api/admin/v1/marketing/reviews/'+reviews.json().items[0].id,headers:adminHeaders,payload:{action:'show'}})).statusCode,200);
   assert.equal((await app.inject({url:'/api/admin/v1/trash',headers:adminHeaders})).statusCode,200);
  }finally{await app.close();}
 }
});

test('archived product preserves media references and never enters automatic purge',async()=>{
 const f=await fixture(),id=randomUUID();
 await ctx.db.pool.query("INSERT INTO product_media(id,uploader_id,source_hash,content_hash,content,width,height) VALUES($1,$2,'fixture','fixture',$3,1,1)",[id,f.actor,Buffer.from('fixture')]);
 await ctx.db.pool.query("UPDATE product_editor SET draft=jsonb_set(draft,'{content,image}',to_jsonb($2::text)) WHERE product_id=$1",[f.p,'/api/store/v1/media/'+id]);
 await ctx.db.pool.query('UPDATE product_editor SET published=draft,published_at=now() WHERE product_id=$1',[f.p]);
 await f.catalog.remove(f.actor,f.p,{revision:1,confirmed:true,sku:'SKU-'+f.p});
 await ctx.db.pool.query("UPDATE products SET archived_at=now()-interval '90 days' WHERE id=$1",[f.p]);
 await assert.rejects(f.trash.deleteMedia(f.actor,id),/ASSET_IN_USE/);assert.equal(await f.trash.cleanup(),0);
 assert.equal((await new MediaService(ctx.db).get(id)).content.length,7);
});
