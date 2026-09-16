// Explicit isolated preview: never reads DATABASE_URL or imports the commercial catalog.
import {randomUUID,randomBytes} from 'node:crypto';
import {testDatabase} from '../tests/postgres.js';
import {buildApp} from '../src/app.js';
import {StaffAuth,totp,decodeBase32} from '../src/staff-auth.js';
import {CommerceService,cartHash} from '../src/commerce.js';
if(process.env.NODE_ENV==='production')throw new Error('Preview is local-only');
const ctx=await testDatabase();let app:Awaited<ReturnType<typeof buildApp>>|undefined;
try{
 const staffSecret=process.env.ASAYA_PREVIEW_ADMIN==='enabled'?randomBytes(32).toString('hex'):undefined;
 if(staffSecret){
  const password='Preview-'+randomBytes(18).toString('base64url');
  const key=Array.from(randomBytes(32),b=>'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[b%32]).join('');
  await new StaffAuth(ctx.db,staffSecret).provision('admin-preview@example.test',password,key);
  console.log('ISOLATED ADMIN: admin-preview@example.test; password:',password);
  const printCode=()=>console.log('ISOLATED ADMIN TOTP:',totp(decodeBase32(key),Math.floor(Date.now()/30000)));
  printCode();setInterval(printCode,30000).unref();
 }
 const product=randomUUID(),warehouse=randomUUID();
 await ctx.db.pool.query("INSERT INTO products(id,sku,name,active,sale_approved) VALUES($1,'CHECKOUT-FIXTURE','Тестовый шампунь',true,true)",[product]);
 await ctx.db.pool.query("INSERT INTO product_prices(product_id,currency,regular_minor,final_minor,approved) VALUES($1,'RUB',25000,25000,true)",[product]);
 await ctx.db.pool.query("INSERT INTO storefront_mappings(slug,candidate_sku,product_id,confidence,approved,reason) VALUES('hair-shampoo','CHECKOUT-FIXTURE',$1,'high',true,'Isolated synthetic fixture')",[product]);
 await ctx.db.pool.query("INSERT INTO warehouses(id,code,name,active) VALUES($1,'TEST','Тестовый склад',true)",[warehouse]);
 await ctx.db.pool.query('INSERT INTO inventory_balances(product_id,warehouse_id,on_hand) VALUES($1,$2,20)',[product,warehouse]);
 if(process.env.ASAYA_PREVIEW_ORDERS==='enabled'){
  const commerce=new CommerceService(ctx.db),items=[{sku:'CHECKOUT-FIXTURE',quantity:1}];
  for(const state of ['pending','paid','cancelled']){
   const buyer=randomUUID(),quote=randomUUID();
   await ctx.db.pool.query('INSERT INTO users(id) VALUES($1)',[buyer]);
   if(state==='paid')await ctx.db.pool.query("INSERT INTO user_identities(channel,destination,user_id,verified_at) VALUES('email','checkout-preview@example.test',$1,now())",[buyer]);
   await ctx.db.pool.query("INSERT INTO delivery_quotes(id,user_id,warehouse_id,amount_minor,currency,cart_hash,snapshot,expires_at,environment) VALUES($1,$2,$3,10000,'RUB',$4,$5,now()+interval '30 minutes','test')",
    [quote,buyer,warehouse,cartHash(items),JSON.stringify({label:'Тестовая доставка',address:{city:'Тестовый город',address:'Тестовая улица, 1'}})]);
   const order=await commerce.createCheckout(buyer,randomUUID(),{items,deliveryQuoteId:quote,customer:{name:'Тестовый покупатель '+state,phone:'+79990000000'},consent:{offerVersion:'test-v1',privacyVersion:'test-v1',marketing:false}});
   if(state==='paid')await commerce.recordPaid({provider:'isolated-fixture',accountId:'test',environment:'test',eventId:randomUUID(),externalPaymentId:randomUUID(),orderId:order.orderId,amountMinor:35000,currency:'RUB'});
   if(state==='cancelled')await commerce.cancel(buyer,order.orderId);
   if(state==='cancelled'&&process.env.ASAYA_PREVIEW_REVIEW==='enabled')await commerce.recordPaid({provider:'isolated-fixture',accountId:'test',environment:'test',eventId:randomUUID(),externalPaymentId:randomUUID(),orderId:order.orderId,amountMinor:35000,currency:'RUB'});
  }
 }
 app=await buildApp({db:ctx.db,otpSecret:randomUUID()+randomUUID(),staffSecret,origin:'http://127.0.0.1:3200',secureCookies:false,
  otpSender:{async sendOtp(input){if(input.channel!=='email'||input.destination!=='checkout-preview@example.test')throw new Error('Test address only');console.log('Local test OTP:',input.code);}},
  ...(process.env.ASAYA_PREVIEW_DELIVERY==='enabled'?{deliveryProvider:{async quote(){return {warehouseId:warehouse,amountMinor:10000,currency:'RUB' as const,label:'Тестовая доставка',expiresInSeconds:300};}}}:{})});
 await app.listen({host:'127.0.0.1',port:3100});
 let closing=false;
 const stop=async()=>{if(closing)return;closing=true;try{await app?.close();await ctx.stop();}finally{process.exit(0);}};
 process.on('SIGINT',()=>void stop());process.on('SIGTERM',()=>void stop());setTimeout(()=>void stop(),15*60_000).unref();
 console.log('Isolated ASAYA preview, 15 minutes. Sign in: checkout-preview@example.test. No external messages, payments or shipments.');
}catch(error){await app?.close();await ctx.stop();throw error;}
