// Used only by the explicit local test launcher, never by src/server.ts.
import {randomBytes,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {z} from 'zod';
import {buildApp} from '../src/app.js';
import {Database} from '../src/db.js';
import {DomainError,equal} from '../src/core.js';
import {StaffAuth,totp,decodeBase32} from '../src/staff-auth.js';
import {AdminCatalog} from '../src/admin-catalog.js';
import type {YcpSettings} from '../src/ycp-catalog.js';

export const testShopOrigin='http://127.0.0.1:3216';
const testCookie='asaya_local_test_staff';
export function requireLocalTestEnvironment(env:NodeJS.ProcessEnv){
 if(env.NODE_ENV==='production'||env.DATABASE_URL||env.ASAYA_ISOLATED_TEST_DATABASE_URL||env.YCP_TOKEN||env.YCP_SETTINGS_FILE||env.DEPLOYMENT_MODE)
  throw new Error('Test shop must start without external database, deployment or YCP configuration.');
}
export type TestProduct={sku:string;name:string;slug:string};
const productsSchema=z.array(z.object({sku:z.string().min(1).max(100),name:z.string().min(1).max(300),slug:z.string().regex(/^[a-z0-9-]+$/)}).strict()).min(1).max(50)
 .refine(v=>new Set(v.map(p=>p.sku)).size===v.length&&new Set(v.map(p=>p.slug)).size===v.length);

// Caller supplies a newly created disposable testDatabase(), not a configured live DB.
export async function createTestShop(db:Database,rawProducts:TestProduct[]){
 if(process.env.NODE_ENV==='production')throw new Error('Local test shop cannot run in production');
 const products=productsSchema.parse(rawProducts);
 const counts=(await db.pool.query('SELECT (SELECT count(*) FROM products)+(SELECT count(*) FROM users)+(SELECT count(*) FROM warehouses)+(SELECT count(*) FROM orders) AS n')).rows[0];
 if(Number(counts.n)!==0)throw new Error('Test shop requires a new empty database');
 const warehouseId=randomUUID(),accountId='local-test-'+randomUUID();
 await db.transaction(async tx=>{
  await tx.query("INSERT INTO warehouses(id,code,name,active) VALUES($1,'LOCAL-TEST','Тестовый склад ASAYA',true)",[warehouseId]);
  for(const product of products){
   const id=randomUUID();
   await tx.query('INSERT INTO products(id,sku,name,active,sale_approved,weight_g,width_mm,height_mm,depth_mm) VALUES($1,$2,$3,true,true,500,100,200,100)',[id,product.sku,product.name]);
   await tx.query("INSERT INTO product_prices(product_id,currency,regular_minor,final_minor,approved) VALUES($1,'RUB',50000,50000,true)",[id]);
   await tx.query("INSERT INTO storefront_mappings(slug,product_id,approved,confidence,reason) VALUES($1,$2,true,'high','Local test copy, never publish')",[product.slug,id]);
   await tx.query('INSERT INTO inventory_balances(product_id,warehouse_id,on_hand) VALUES($1,$2,0)',[id,warehouseId]);
  }
 });
 const secret=randomBytes(32).toString('hex'),staff=new StaffAuth(db,secret);
 const password=randomBytes(32).toString('hex'),totpKey=Array.from(randomBytes(32),b=>'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[b%32]).join('');
 const email='test-admin@example.test';await staff.provision(email,password,totpKey);
 const login=await staff.login({email,password,code:totp(decodeBase32(totpKey),Math.floor(Date.now()/30000))},'127.0.0.1');
 const settings:YcpSettings={accountId,environment:'test',publicOrigin:'https://local-asaya.example.test',priceUnit:'minor',vat:0,
  checkout:{deliveryPriceUnit:'minor'},button:{enabled:false},warehouses:[{warehouseId,address:'Тестовая улица, 1',phone:'+79990000000',servedLocalities:['Москва'],ycpDeliveryEnabled:false}]};
 const ycpToken=randomBytes(32).toString('hex');
 const app=await buildApp({db,otpSecret:randomBytes(32).toString('hex'),staffSecret:secret,origin:testShopOrigin,secureCookies:false,ycp:{token:ycpToken,settings},
  otpSender:{async sendOtp(){throw new Error('External messages disabled');}}});
 const catalog=new AdminCatalog(db);
 // In-process HTTP exercises the real YCP routes/authentication. No network request.
 async function protocol(path:string,payload:Record<string,unknown>){
  const response=await app.inject({method:'POST',url:'/api/v1/'+path,headers:{host:new URL(testShopOrigin).host,authorization:'Bearer '+ycpToken},payload});
  const data=response.json();
  if(response.statusCode>=400)throw new DomainError(data.error??'TEST_PROTOCOL_ERROR',response.statusCode);
  return data;
 }
 const bootstrap=randomBytes(32).toString('hex');let bootstrapUsed=false;
 const date=new Date().toISOString().slice(0,10);
 // Host check blocks DNS rebinding; the launcher binds only 127.0.0.1.
 app.addHook('onRequest',async(req,reply)=>{
  if(req.headers.host!==new URL(testShopOrigin).host)throw new DomainError('HOST_REJECTED',403);
  reply.header('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  reply.header('Referrer-Policy','no-referrer');
 });
 for(const [url,file,mime] of [['/','index.html','text/html; charset=utf-8'],['/test-shop.js','test-shop.js','text/javascript; charset=utf-8'],['/test-shop.css','test-shop.css','text/css; charset=utf-8']]){
  const data=await readFile(resolve('test-shop-ui',file!));
  app.get(url!,async(_req,reply)=>reply.type(mime!).send(data));
 }
 app.post('/test-shop/open',async(req,reply)=>{
  const key=req.headers['x-asaya-test-key'];
  if(bootstrapUsed||typeof key!=='string'||!equal(key,bootstrap))throw new DomainError('TEST_LINK_EXPIRED',401);
  bootstrapUsed=true;
  reply.setCookie(testCookie,login.token,{httpOnly:true,secure:false,sameSite:'strict',path:'/',maxAge:3600});
  return {ok:true};
 });
 await app.register(async secured=>{
  secured.addHook('onRequest',async req=>{
   const session=await staff.session(req.cookies[testCookie]);
   if(req.method!=='GET'&&(typeof req.headers['x-csrf-token']!=='string'||!equal(req.headers['x-csrf-token'],session.csrfToken)))throw new DomainError('CSRF_REJECTED',403);
  });
  secured.get('/test-shop/api/state',async req=>{
   const session=await staff.session(req.cookies[testCookie]);
   const items=(await db.pool.query(`SELECT p.id,p.sku,p.name,b.on_hand AS "onHand",b.reserved,pr.final_minor::int AS "priceMinor"
    FROM products p JOIN inventory_balances b ON b.product_id=p.id AND b.warehouse_id=$1 JOIN product_prices pr ON pr.product_id=p.id ORDER BY p.sku`,[warehouseId])).rows;
   const recentOrders=(await db.pool.query(`SELECT y.session_id AS "sessionId",o.public_number AS number,o.status,o.payment_status AS "paymentStatus",o.total_minor::int AS "totalMinor",
    (SELECT json_agg(json_build_object('sku',i.sku,'quantity',i.quantity)) FROM order_items i WHERE i.order_id=o.id) AS items
    FROM ycp_sessions y JOIN orders o ON o.id=y.order_id WHERE y.account_id=$1 AND y.environment='test' ORDER BY o.created_at DESC LIMIT 30`,[accountId])).rows;
   const basket=await protocol('checkout/basket/check',{items:items.map(p=>({id:p.sku,quantity:1})),offers_id_from_merchant_center:false,locality:'Москва',is_health_check:false});
   const ycpAvailable=Object.fromEntries(basket.items.map((p:{id:string;warehouses:Array<{id:string;available_quantity:number}>})=>[p.id,p.warehouses.find(w=>w.id===warehouseId)?.available_quantity??0]));
   return {mode:'local-test',csrfToken:session.csrfToken,warehouseId,items:items.map(p=>({...p,ycpAvailable:ycpAvailable[p.sku]})),orders:recentOrders};
  });
  secured.put('/test-shop/api/stock/:id',async req=>{
   const id=z.object({id:z.uuid()}).parse(req.params).id;
   const body=z.object({expectedOnHand:z.number().int().nonnegative(),onHand:z.number().int().min(0).max(1000000)}).strict().parse(req.body);
   return catalog.stock((await staff.session(req.cookies[testCookie])).user.id,id,{...body,warehouseId});
  });
  secured.post('/test-shop/api/sessions',async req=>{
   const body=z.object({sessionId:z.uuid(),items:z.array(z.object({sku:z.string().min(1).max(100),quantity:z.number().int().min(1).max(100)}).strict()).min(1).max(50)}).strict().parse(req.body);
   const prices=(await db.pool.query('SELECT p.sku,pr.regular_minor::int,pr.final_minor::int FROM products p JOIN product_prices pr ON pr.product_id=p.id WHERE p.sku=ANY($1::text[])',[body.items.map(i=>i.sku)])).rows;
   const items=body.items.map(i=>{const price=prices.find(p=>p.sku===i.sku);if(!price)throw new DomainError('PRODUCT_NOT_FOUND',404);return {id:i.sku,quantity:i.quantity,regular_price:price.regular_minor,final_price:price.final_minor};});
   return protocol('checkout',{session_id:body.sessionId,warehouse_id:warehouseId,items,customer:{full_name:'Тестовый покупатель',phone:'+79990000000',email:'buyer@example.test'},
    delivery:{delivery_method:'courier',service_type:'cdek',price:0,address:{locality:'Москва',address:'Тестовая улица, 1'},delivery_date_interval:{start_interval:{date},end_interval:{date},time_zone:3}}});
  });
  secured.post('/test-shop/api/sessions/:id/:action',async req=>{
   const {id,action}=z.object({id:z.uuid(),action:z.enum(['pay','cancel','deliver'])}).parse(req.params);
   z.object({}).strict().parse(req.body);
   const order=(await db.pool.query(`SELECT o.id,o.public_number,o.external_ycp_order_id FROM ycp_sessions y JOIN orders o ON o.id=y.order_id WHERE y.account_id=$1 AND y.environment='test' AND y.session_id=$2`,[accountId,id])).rows[0];
   if(!order)throw new DomainError('ORDER_NOT_FOUND',404);
   if(action==='pay')return protocol('checkout/placed',{session_id:id,order_id:'test-'+id,order_number:Number(String(order.public_number).replace(/^ASAYA-/,'')),payment_method:'online',online_payment_method:'card',acquiring_id:'simulated-'+id});
   if(action==='cancel')return protocol(order.external_ycp_order_id?'order/cancel?order_id='+encodeURIComponent(order.external_ycp_order_id):'checkout/cancel?session_id='+id,{});
   if(!order.external_ycp_order_id)throw new DomainError('TEST_PAYMENT_REQUIRED',409);
   const lines=(await db.pool.query('SELECT sku AS id,quantity FROM order_items WHERE order_id=$1',[order.id])).rows;
   return protocol('order/delivered?order_id='+encodeURIComponent(order.external_ycp_order_id),{purchased_items:lines});
  });
 });
 return {app,openUrl:testShopOrigin+'/#'+bootstrap};
}
