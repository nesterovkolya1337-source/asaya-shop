import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {testDatabase} from './postgres.js';
import {AuthService} from '../src/auth.js';
import {SMS_CONSENT_VERSION} from '../src/sms-consent-policy.js';
import {buildApp} from '../src/app.js';
let ctx:Awaited<ReturnType<typeof testDatabase>>;
before(async()=>{ctx=await testDatabase();});after(async()=>ctx?.stop());
test('guest, zero balance, maximum, partial and reset previews use canonical discounted price without debit or payable changes',async()=>{
 const db=ctx.db,product=randomUUID(),secret='s'.repeat(32),origin='http://localhost:3200';let code='';
 const sender={sendOtp:async(m:{code:string})=>{code=m.code;}};
 const auth=new AuthService(db,secret,sender,undefined,{},true);
 const ch=await auth.request('sms','+79991230000','local',{accepted:true,version:SMS_CONSENT_VERSION});const session=await auth.verify(ch.challengeId,code,'local');
 await db.pool.query("INSERT INTO products(id,sku,name,active,sale_approved) VALUES($1,'BONUS','Local',true,true)",[product]);
 await db.pool.query("INSERT INTO product_prices(product_id,currency,regular_minor,final_minor,approved) VALUES($1,'RUB',79900,79900,true)",[product]);
 await db.pool.query("INSERT INTO product_editor(product_id,revision,draft,published) VALUES($1,1,'{}',$2)",[product,{content:{category:'body',setKind:'none'}}]);
 const app=await buildApp({db,otpSecret:secret,staffSecret:secret,otpSender:sender,origin,secureCookies:false,deploymentMode:'catalog'});
 const items=[{sku:'BONUS',quantity:3}],request=(previewPoints?:number,customer=true)=>app.inject({method:'POST',url:'/api/store/v1/cart/pricing',headers:{origin,...(customer?{cookie:'asaya_dev_session='+session.token}:{})},payload:{items,...(previewPoints===undefined?{}:{previewPoints})}});
 try{
  assert.equal((await request(undefined,false)).json().loyalty,null);assert.equal((await request(1,false)).statusCode,401);
  const empty=(await request()).json();assert.equal(empty.loyalty.balance,0);assert.equal(empty.loyalty.cashbackPoints,64);assert.equal(empty.subtotalMinor,215700);
  const customer=(await db.pool.query('SELECT id FROM customer_profiles WHERE user_id=$1',[session.user.id])).rows[0].id;
  await db.pool.query("INSERT INTO loyalty_ledger(id,customer_id,type,points,source,source_key,description) VALUES($1,$2,'admin_adjustment',500,'fixture','cart-bonus-fixture','Fixture')",[randomUUID(),customer]);
  for(const [points,cash,earn] of [[431,172600,51],[100,205700,61],[0,215700,64]]){
   const r=await request(points);assert.equal(r.statusCode,200,r.body);const q=r.json();assert.equal(q.subtotalMinor,215700);assert.equal(q.loyalty.maximum,431);assert.equal(q.loyalty.redemptionAvailable,false);assert.equal(q.loyalty.preview.applied,false);assert.equal(q.loyalty.preview.cashProductMinor,cash);assert.equal(q.loyalty.preview.cashbackPoints,earn);
  }
  assert.equal((await request(432)).statusCode,409);assert.equal((await request(1.5)).statusCode,400);assert.equal((await request(-1)).statusCode,400);
  assert.equal((await db.pool.query('SELECT count(*)::int n FROM loyalty_ledger')).rows[0].n,1);assert.equal((await db.pool.query('SELECT count(*)::int n FROM orders')).rows[0].n,0);
 }finally{await app.close();}
});
