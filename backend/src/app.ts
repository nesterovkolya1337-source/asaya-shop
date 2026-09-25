import {Promocodes} from './promocodes.js';
import {AdminMerchandising} from './admin-merchandising.js';
import {SmsConsent,smsConsentInput} from './sms-consent.js';
import {Trash} from './trash.js';
import {Engagement} from './engagement.js';
import {Loyalty,loyaltyAmounts} from './loyalty.js';
import {Marketing} from './marketing.js';
import {cartPricing} from './cart-pricing.js';
import {StorefrontControls} from './storefront-controls.js';
import {AdminStocks} from './admin-stocks.js';
import type {StockSync} from './stock-sync.js';
import {Warehouses} from './warehouses.js';
import {CustomerYandexAuth,YandexIdProvider,yandexCallbackPath,type YandexIdentityProvider} from './yandex-id.js';
import {randomUUID} from 'node:crypto';
import {YcpRequestTrace} from './ycp-request-trace.js';
import Fastify,{LogController} from 'fastify';
import cookie from '@fastify/cookie';
import { z,ZodError } from 'zod';
import { AuthService,DisabledOtpSender,type OtpSender } from './auth.js';
import type {OtpPolicy} from './otp-policy.js';
import { Database } from './db.js';
import { CommerceService } from './commerce.js';
import { DomainError,equal,hash } from './core.js';
import {DeliveryService,type DeliveryProvider} from './delivery.js';
import {StaffAuth,TRUSTED_SECONDS} from './staff-auth.js';
import {AdminCatalog} from './admin-catalog.js';
import {SiteContent} from './site-content.js';
import {MediaService} from './media.js';
import {AdminOrders} from './admin-orders.js';
import {AdminPrivacy} from './admin-privacy.js';
import {AdminIntegration} from './admin-integration.js';
import {AdminReadiness} from './admin-readiness.js';
import {AdminStatistics} from './admin-statistics.js';
import {AnalyticsReport} from './analytics-report.js';
import {ProductAnalytics} from './product-analytics.js';
import {YcpCatalog,parseYcpSettings} from './ycp-catalog.js';
import {YcpCheckout,YcpConflict} from './ycp-checkout.js';
import {YcpOrders} from './ycp-orders.js';
import {YandexFeed} from './yandex-feed.js';
import {CustomerAccount} from './customer-account.js';
import {authorizeCdekWebhook,type OrderTracking} from './order-tracking.js';
import type {FulfillmentDispatch} from './fulfillment-dispatch.js';
declare module 'fastify' {interface FastifyContextConfig {cdekWebhook?:boolean}}

export async function buildApp(options:{promoLocalPreview?:boolean;stock?:StockSync;deploymentMode?:'foundation'|'catalog'|'ycp';db:Database;otpSecret:string;otpSender:OtpSender;otpPolicy?:Partial<OtpPolicy>;customerSmsEnabled?:boolean;origin:string;secureCookies:boolean;logger?:boolean;deliveryProvider?:DeliveryProvider;staffSecret?:string;ycp?:{token:string;settings:unknown};yandexIdClientId?:string;yandexIdentityProvider?:YandexIdentityProvider;cdekTracking?:{service:OrderTracking;secret:string};fulfillment?:FulfillmentDispatch}) {
 if(options.fulfillment)throw new Error('ASAYA fulfillment dispatch is disabled: Yandex Checkout owns shipment creation');
 // Preview is opt-in and loopback-only; production has no promo application switch yet.
 const promoApplicationEnabled=options.promoLocalPreview===true&&options.deploymentMode!=='ycp'&&['127.0.0.1','localhost','[::1]'].includes(new URL(options.origin).hostname);
 const smsEnabled=options.customerSmsEnabled===true;
 if(options.cdekTracking&&(options.cdekTracking.secret.length<32||[options.otpSecret,options.staffSecret,options.ycp?.token].includes(options.cdekTracking.secret)))throw new Error('CDEK callback requires an independent secret');
 if(smsEnabled&&options.otpSender instanceof DisabledOtpSender)throw new Error('Customer SMS requires a configured sender');
 if(options.deploymentMode==='catalog'&&(!options.staffSecret||options.ycp))throw new Error('Catalog mode requires staff authentication and disables YCP');
 const controls=new StorefrontControls(options.db,options.deploymentMode==='catalog'||options.deploymentMode==='ycp');
 const liveYcp=options.deploymentMode==='ycp';
 if(liveYcp){
  if(!options.staffSecret||!options.ycp)throw new Error('YCP mode requires staff authentication and YCP settings');
  const settings=parseYcpSettings(options.ycp.settings,true);
  if(settings.environment!=='production'||!options.secureCookies||new URL(options.origin).protocol!=='https:'||new URL(settings.publicOrigin).origin!==options.origin)
   throw new Error('YCP mode requires production settings matching the HTTPS storefront');
  if(options.ycp.token===options.otpSecret||options.ycp.token===options.staffSecret)throw new Error('YCP requires a separate inbound credential');
 }
 const ycp=options.ycp?new YcpCatalog(options.db,options.ycp.token,options.ycp.settings,liveYcp):null;
 const ycpCheckout=options.ycp?new YcpCheckout(options.db,options.ycp.settings,undefined,liveYcp):null;
 const ycpOrders=options.ycp?new YcpOrders(options.db,options.ycp.settings,undefined,liveYcp):null;
 const yandexFeed=options.ycp?new YandexFeed(options.db,options.ycp.settings,undefined,liveYcp):null;
 const trace=options.ycp?new YcpRequestTrace(options.db,options.ycp.settings,options.otpSecret):null;
 const authenticatedYcp=new WeakSet<object>();
 const errorKinds=new WeakMap<object,string>();
 const app=Fastify({requestIdHeader:false,genReqId:()=>randomUUID(),logger:options.logger ? {redact:['req.headers.cookie','req.headers.authorization','req.headers.x-csrf-token']} : false,
  logController:new LogController({disableRequestLogging:true}),bodyLimit:32*1024,requestTimeout:5000,trustProxy:false});
 await app.register(cookie);
 const auth=new AuthService(options.db,options.otpSecret,options.otpSender,undefined,options.otpPolicy,smsEnabled);
 const yandexProvider=options.yandexIdClientId?new YandexIdProvider(options.yandexIdClientId,options.origin):null;
 if(yandexProvider&&!options.secureCookies)throw new Error('Yandex ID requires secure cookies');
 const customerYandex=yandexProvider?new CustomerYandexAuth(options.db,options.otpSecret,options.yandexIdClientId!,options.yandexIdentityProvider??yandexProvider):null;
 const commerce=new CommerceService(options.db,undefined,liveYcp||options.deploymentMode==='catalog'?'production':'test');
 const account=new CustomerAccount(options.db);
 const delivery=new DeliveryService(options.db,options.deliveryProvider);
 const staff=options.staffSecret?new StaffAuth(options.db,options.staffSecret):null;
 const adminCatalog=new AdminCatalog(options.db);
 const siteContent=new SiteContent(options.db);
 const media=new MediaService(options.db);
 const engagement=new Engagement(options.db);
 const adminOrders=new AdminOrders(options.db,options.cdekTracking?.service);
 const staffCookie=options.secureCookies?'__Host-asaya_staff':'asaya_dev_staff';
 const setupCookie=options.secureCookies?'__Host-asaya_staff_setup':'asaya_dev_staff_setup';
 const staffCookieOptions={httpOnly:true,secure:options.secureCookies,sameSite:'strict' as const,path:'/',maxAge:TRUSTED_SECONDS};
 const setupCookieOptions={...staffCookieOptions,maxAge:900};
 const cookieName=options.secureCookies?'__Host-asaya_session':'asaya_dev_session';
 const cookieOptions={httpOnly:true,secure:options.secureCookies,sameSite:'strict' as const,path:'/',maxAge:7*86400};
 const flowCookie='__Host-asaya_yandex_flow';
 const flowCookieOptions={httpOnly:true,secure:true,sameSite:'lax' as const,path:'/',maxAge:600};
 app.addHook('onRequest',async(req,reply)=>{
  reply.header('X-Request-ID',req.id).header('Cache-Control','no-store').header('X-Content-Type-Options','nosniff');
  if(req.routeOptions.config.cdekWebhook){
   if(!options.cdekTracking)throw new DomainError('NOT_FOUND',404);
   authorizeCdekWebhook((req.params as {key?:string}).key,options.cdekTracking.secret);return;
  }
  const stockRefresh=req.method==='POST'&&req.routeOptions.url==='/api/admin/v1/analytics/stocks/refresh';
  const cartQuote=req.method==='POST'&&req.routeOptions.url==='/api/store/v1/cart/pricing';
  const analyticsEvent=req.method==='POST'&&req.routeOptions.url==='/api/store/v1/analytics/events';
  const engagementEdit=smsEnabled&&req.method==='POST'&&['/api/store/v1/account/reviews','/api/store/v1/account/referral'].includes(req.routeOptions.url??'');
  const accountEdit=smsEnabled&&req.method==='PUT'&&req.routeOptions.url==='/api/store/v1/account/profile';
  const privacyEdit=req.method==='POST'&&req.routeOptions.url==='/api/admin/v1/orders/:id/privacy';
  const cdekRefresh=req.method==='POST'&&req.routeOptions.url==='/api/admin/v1/orders/:id/cdek/refresh';
  const ffRecheck=!!options.fulfillment&&req.method==='POST'&&req.routeOptions.url==='/api/admin/v1/orders/:id/fulfillment/recheck';
  if(options.deploymentMode==='catalog'&&['POST','PUT','PATCH','DELETE'].includes(req.method)){
   const route=req.routeOptions.url??'';
   const customerLogin=req.method==='POST'&&(!!customerYandex&&['/api/store/v1/auth/yandex/start','/api/store/v1/auth/logout'].includes(route)||smsEnabled&&['/api/store/v1/auth/sms-consent/status','/api/store/v1/auth/otp/request','/api/store/v1/auth/otp/verify','/api/store/v1/auth/logout'].includes(route));
   if(!cartQuote&&!stockRefresh&&!analyticsEvent&&!cdekRefresh&&!privacyEdit&&!accountEdit&&!engagementEdit&&!customerLogin&&!/^\/api\/admin\/v1\/(auth\/(login|logout|activate\/(start|password|confirm))|sms-consents(?:\/revoke)?|employees(?:\/.*)?|marketing(?:\/.*)?|promocodes(?:\/.*)?|media(?:\/.*)?|trash(?:\/.*)?|banner|sales|products(?:\/.*)?|prices(?:\/.*)?|merchandising|warehouses(?:\/.*)?|site-pages\/:page(?:\/(?:publish|restore))?)$/.test(route))throw new DomainError('CATALOG_ONLY',503);
  }
  if(liveYcp&&['POST','PUT','PATCH','DELETE'].includes(req.method)){
   const route=req.routeOptions.url??'';
   const adminEdit=/^\/api\/admin\/v1\/(auth\/(login|logout|activate\/(start|password|confirm))|sms-consents(?:\/revoke)?|employees(?:\/.*)?|marketing(?:\/.*)?|promocodes(?:\/.*)?|media(?:\/.*)?|trash(?:\/.*)?|banner|sales|products(?:\/.*)?|prices(?:\/.*)?|merchandising|warehouses(?:\/.*)?|site-pages\/:page(?:\/(?:publish|restore))?)$/.test(route);
   const checkoutLink=req.method==='POST'&&route==='/api/store/v1/yandex/checkout-link';
   // Yandex owns checkout/payments; CDEK callbacks have their own boundary. Do not enable the
   // local checkout or local-only order changes with customer SMS sign-in.
   const customerLogin=req.method==='POST'&&(!!customerYandex&&['/api/store/v1/auth/yandex/start','/api/store/v1/auth/logout'].includes(route)||smsEnabled&&['/api/store/v1/auth/sms-consent/status','/api/store/v1/auth/otp/request','/api/store/v1/auth/otp/verify','/api/store/v1/auth/logout'].includes(route));
   if(!cartQuote&&!stockRefresh&&!analyticsEvent&&!cdekRefresh&&!privacyEdit&&!ffRecheck&&!accountEdit&&!engagementEdit&&!adminEdit&&!checkoutLink&&!customerLogin&&!req.routeOptions.config.ycp)throw new DomainError('YANDEX_CHECKOUT_ONLY',503);
  }
  if(req.routeOptions.config.ycp){
   if(!ycp)throw new DomainError('YCP_UNAVAILABLE',503);
   ycp.authorize(req.headers.authorization);authenticatedYcp.add(req);return;
  }
  if(['POST','PUT','PATCH','DELETE'].includes(req.method) && req.headers.origin!==options.origin) throw new DomainError('ORIGIN_REJECTED',403);
 });
 app.addHook('onResponse',async(req,reply)=>{
  const durationMs=reply.elapsedTime;
  // Resolution runs after the response: diagnostic failures cannot undo a committed order.
  const correlation=options.logger&&authenticatedYcp.has(req)&&trace?await trace.resolve(req.routeOptions.url??'',req.body,req.query):{};
  req.log.info({requestId:req.id,route:req.routeOptions.url,method:req.method,status:reply.statusCode,durationMs,errorKind:errorKinds.get(req),...correlation},'request complete');
 });
 app.setErrorHandler((error,req,reply)=>{
  errorKinds.set(req,error instanceof ZodError?'INVALID_INPUT':error instanceof DomainError?'DOMAIN_ERROR':'REQUEST_ERROR');
  if(error instanceof YcpConflict)return reply.status(409).send({error:error.code,...error.details});
  if(error instanceof ZodError) return reply.status(400).send({error:'INVALID_INPUT',requestId:req.id});
  if(error instanceof DomainError) return reply.status(error.status).send({error:error.code,requestId:req.id});
  const status=(error as {statusCode?:number}).statusCode;
  if(status&&status>=400&&status<500) return reply.status(status).send({error:'INVALID_REQUEST',requestId:req.id});
  errorKinds.set(req,'INTERNAL_ERROR');
  req.log.error({requestId:req.id,errorKind:'INTERNAL_ERROR'},'request failed');
  return reply.status(500).send({error:'INTERNAL_ERROR',requestId:req.id});
 });
 app.post('/api/admin/v1/auth/login',async(req,reply)=>{
  if(!staff)throw new DomainError('STAFF_UNAVAILABLE',503);
  const result=await staff.login(req.body,req.ip);
  reply.setCookie(staffCookie,result.token,staffCookieOptions);
  return {user:result.user,csrfToken:result.csrfToken};
 });
 app.post('/api/admin/v1/auth/activate/start',async(req,reply)=>{
  if(!staff)throw new DomainError('STAFF_UNAVAILABLE',503);
  const result=await staff.activationStart(req.body,req.ip);reply.setCookie(setupCookie,result.token,setupCookieOptions);
  return {stage:result.stage,csrfToken:result.csrfToken};
 });
 await app.register(async setup=>{
  setup.addHook('onRequest',async req=>{
   if(!staff)throw new DomainError('STAFF_UNAVAILABLE',503);
   const session=await staff.activationSession(req.cookies[setupCookie]);
   if(req.method!=='GET'&&(typeof req.headers['x-csrf-token']!=='string'||!equal(req.headers['x-csrf-token'],session.csrfToken)))throw new DomainError('CSRF_REJECTED',403);
  });
  setup.get('/api/admin/v1/auth/activate/me',async req=>staff!.activationSession(req.cookies[setupCookie]));
  setup.get('/api/admin/v1/auth/activate/setup',async req=>staff!.activationSetup(req.cookies[setupCookie]!));
  setup.post('/api/admin/v1/auth/activate/password',async req=>staff!.activationPassword(req.cookies[setupCookie]!,req.body));
  setup.post('/api/admin/v1/auth/activate/confirm',async(req,reply)=>{
   const result=await staff!.activationConfirm(req.cookies[setupCookie]!,req.body);
   reply.clearCookie(setupCookie,setupCookieOptions).setCookie(staffCookie,result.token,staffCookieOptions);
   return {user:result.user,csrfToken:result.csrfToken,recoveryCodes:result.recoveryCodes};
  });
 });
 await app.register(async secured=>{
  secured.addHook('onRequest',async(req,reply)=>{
   if(!staff)throw new DomainError('STAFF_UNAVAILABLE',503);
   const session=await staff.session(req.cookies[staffCookie]);
   reply.setCookie(staffCookie,req.cookies[staffCookie]!,staffCookieOptions);
   const route=req.routeOptions.url??'';
   if(session.user.staffRole==='manager'&&(!/^\/api\/admin\/v1\/(auth\/(me|logout)|products(?:\/.*)?|prices(?:\/.*)?|merchandising|orders(?:\/.*)?|analytics(?:\/.*)?|statistics|marketing(?:\/.*)?|promocodes(?:\/.*)?|site-pages(?:\/.*)?|banner|sales|media(?:\/.*)?|trash(?:\/.*)?)$/.test(route)||route.endsWith('/privacy')))throw new DomainError('FORBIDDEN',403);
   if(req.method!=='GET'&&(typeof req.headers['x-csrf-token']!=='string'||!equal(req.headers['x-csrf-token'],session.csrfToken)))throw new DomainError('CSRF_REJECTED',403);
  });
  const actor=async(token:string|undefined)=>(await staff!.session(token)).user.id;
  secured.post('/api/admin/v1/media',{bodyLimit:28*1024*1024},async(req,reply)=>{
   const result=await media.upload(await actor(req.cookies[staffCookie]),req.body);return reply.status(201).send(result);
  });
  secured.get('/api/admin/v1/auth/me',async req=>staff!.session(req.cookies[staffCookie]));
  secured.post('/api/admin/v1/auth/logout',async(req,reply)=>{
   await staff!.logout(req.cookies[staffCookie]!);reply.clearCookie(staffCookie,{path:'/',httpOnly:true,secure:options.secureCookies,sameSite:'strict'});return {ok:true};
  });
  secured.get('/api/admin/v1/employees',async req=>staff!.employees(await actor(req.cookies[staffCookie])));
  secured.post('/api/admin/v1/employees',async req=>staff!.createEmployee(await actor(req.cookies[staffCookie]),req.body));
  secured.post('/api/admin/v1/employees/:id',async req=>staff!.changeEmployee(await actor(req.cookies[staffCookie]),z.object({id:z.uuid()}).parse(req.params).id,req.body));
  secured.get('/api/admin/v1/products',async req=>adminCatalog.list(req.query));
  const pageId=(raw:unknown)=>z.object({page:z.string().max(50)}).parse(raw).page;
  const smsConsents=new SmsConsent(options.db);
  secured.get('/api/admin/v1/sms-consents',async req=>{const {phone}=z.object({phone:z.string().max(30)}).strict().parse(req.query);return smsConsents.history(phone);});
  secured.post('/api/admin/v1/sms-consents/revoke',async req=>{const {phone,reason}=z.object({phone:z.string().max(30),reason:z.string().trim().min(1).max(500)}).strict().parse(req.body);return smsConsents.revoke(phone,await actor(req.cookies[staffCookie]),reason);});
  secured.get('/api/admin/v1/site-pages/:page',async req=>siteContent.get(pageId(req.params)));
  secured.put('/api/admin/v1/site-pages/:page',{bodyLimit:512*1024},async req=>siteContent.save(await actor(req.cookies[staffCookie]),pageId(req.params),req.body));
  secured.post('/api/admin/v1/site-pages/:page/publish',async req=>siteContent.publish(await actor(req.cookies[staffCookie]),pageId(req.params),req.body));
  secured.post('/api/admin/v1/site-pages/:page/restore',async req=>siteContent.restore(await actor(req.cookies[staffCookie]),pageId(req.params),req.body));
  secured.get('/api/admin/v1/integration-issues',async req=>new AdminIntegration(options.db).list(await actor(req.cookies[staffCookie]),req.query));
  secured.get('/api/admin/v1/readiness',async req=>new AdminReadiness(options.db,options.deploymentMode==='catalog',!!ycp).get(await actor(req.cookies[staffCookie]),req.query));
  const stocks=new AdminStocks(options.db,options.stock);
  secured.get('/api/admin/v1/analytics/stocks',async req=>stocks.read(await actor(req.cookies[staffCookie]),req.query));
  secured.post('/api/admin/v1/analytics/stocks/refresh',async req=>stocks.refresh(await actor(req.cookies[staffCookie]),req.body));
  secured.get('/api/admin/v1/analytics',async req=>new AnalyticsReport(options.db).get(await actor(req.cookies[staffCookie]),req.query));
  secured.get('/api/admin/v1/statistics',async req=>new AdminStatistics(options.db).get(await actor(req.cookies[staffCookie]),req.query));
  const id=(raw:unknown)=>z.object({id:z.uuid()}).parse(raw).id;
  secured.get('/api/admin/v1/yandex/feed-status',async()=>{
   const url='/api/store/v1/yandex/feed.xml';
   if(!yandexFeed)return {url,status:'unconfigured',offers:0,checkedAt:new Date().toISOString()};
   try{const r=await yandexFeed.render();return {url,status:'valid',offers:r.included,checkedAt:r.generatedAt};}
   catch(e){return {url,status:'invalid',offers:0,checkedAt:new Date().toISOString(),error:e instanceof DomainError?e.code:'FEED_CHECK_FAILED',issues:(e as {issues?:unknown}).issues??[]};}
  });
  const merchandising=new AdminMerchandising(options.db);
  secured.get('/api/admin/v1/merchandising',async()=>merchandising.read());
  secured.put('/api/admin/v1/merchandising',async req=>merchandising.save(await actor(req.cookies[staffCookie]),req.body));
  secured.get('/api/admin/v1/prices',async()=>merchandising.prices());
  secured.put('/api/admin/v1/prices/:id',async req=>merchandising.price(await actor(req.cookies[staffCookie]),id(req.params),req.body));

  secured.get('/api/admin/v1/warehouses',async()=>new Warehouses(options.db).list());
  secured.put('/api/admin/v1/warehouses/:id',async req=>new Warehouses(options.db).save(await actor(req.cookies[staffCookie]),id(req.params),req.body));
  secured.get('/api/admin/v1/orders',async req=>adminOrders.list(await actor(req.cookies[staffCookie]),req.query));
  secured.get('/api/admin/v1/orders/:id',async req=>adminOrders.detail(await actor(req.cookies[staffCookie]),id(req.params)));
  secured.post('/api/admin/v1/orders/:id/cdek/refresh',async req=>adminOrders.refreshDelivery(await actor(req.cookies[staffCookie]),id(req.params),req.body));
  secured.get('/api/admin/v1/orders/:id/privacy',async req=>new AdminPrivacy(options.db).preview(await actor(req.cookies[staffCookie]),id(req.params),req.query));
  secured.post('/api/admin/v1/orders/:id/privacy',async req=>new AdminPrivacy(options.db).apply(await actor(req.cookies[staffCookie]),id(req.params),req.body));
  if(options.fulfillment)secured.post('/api/admin/v1/orders/:id/fulfillment/recheck',async req=>{await actor(req.cookies[staffCookie]);z.object({}).strict().parse(req.body);return options.fulfillment!.reconcile(id(req.params));});
  secured.post('/api/admin/v1/orders/:id/cancel',async req=>{await commerce.adminCancel(await actor(req.cookies[staffCookie]),id(req.params),req.body);return {ok:true};});
  secured.post('/api/admin/v1/orders/:id/start-processing',async req=>{await commerce.adminStartProcessing(await actor(req.cookies[staffCookie]),id(req.params),req.body);return {ok:true};});
  secured.post('/api/admin/v1/orders/:id/complete-packing',async req=>{await commerce.adminCompletePacking(await actor(req.cookies[staffCookie]),id(req.params),req.body);return {ok:true};});
  secured.post('/api/admin/v1/orders/:id/dispatch',async req=>{await commerce.adminDispatch(await actor(req.cookies[staffCookie]),id(req.params),req.body);return {ok:true};});
  secured.post('/api/admin/v1/orders/:id/complete',async req=>{await commerce.adminCompleteOrder(await actor(req.cookies[staffCookie]),id(req.params),req.body);return {ok:true};});
  secured.get('/api/admin/v1/marketing/reviews',async req=>engagement.reviews(await actor(req.cookies[staffCookie])));
  secured.post('/api/admin/v1/marketing/reviews/:id',async req=>engagement.moderate(await actor(req.cookies[staffCookie]),id(req.params),req.body));
  const trash=new Trash(options.db);
  secured.post('/api/admin/v1/trash/:kind/:id/purge',async req=>{const p=z.object({kind:z.enum(['product','media']),id:z.uuid()}).parse(req.params);return trash.purge(await actor(req.cookies[staffCookie]),p.kind,p.id,req.body);});
  secured.get('/api/admin/v1/trash',async req=>trash.list(await actor(req.cookies[staffCookie])));
  secured.get('/api/admin/v1/media',async req=>trash.assets(await actor(req.cookies[staffCookie])));
  secured.post('/api/admin/v1/media/:id/delete',async req=>trash.deleteMedia(await actor(req.cookies[staffCookie]),id(req.params)));
  secured.post('/api/admin/v1/trash/:kind/:id/restore',async req=>{const p=z.object({kind:z.enum(['product','media']),id:z.uuid()}).parse(req.params);return trash.restore(await actor(req.cookies[staffCookie]),p.kind,p.id);});
  const promos=new Promocodes(options.db);
  secured.get('/api/admin/v1/promocodes',async()=>promos.list());
  secured.put('/api/admin/v1/promocodes/:id',async req=>promos.save(await actor(req.cookies[staffCookie]),id(req.params),req.body));
  const marketing=new Marketing(options.db);
  secured.get('/api/admin/v1/marketing',async()=>marketing.read());
  for(const action of ['save','publish','restore','defaults'] as const)secured.post('/api/admin/v1/marketing/'+action,async req=>marketing.change(await actor(req.cookies[staffCookie]),action,req.body));
  secured.get('/api/admin/v1/sales',async()=>controls.sales());
  secured.put('/api/admin/v1/sales',async req=>controls.saveSales(await actor(req.cookies[staffCookie]),req.body));
  secured.get('/api/admin/v1/banner',async()=>controls.banner());
  secured.put('/api/admin/v1/banner',async req=>controls.saveBanner(await actor(req.cookies[staffCookie]),req.body));
  secured.get('/api/admin/v1/products/:id/test-stock',async req=>controls.stock(id(req.params)));
  secured.put('/api/admin/v1/products/:id/test-stock',async req=>controls.saveStock(await actor(req.cookies[staffCookie]),id(req.params),req.body));
  secured.get('/api/admin/v1/products/:id',async req=>adminCatalog.detail(id(req.params)));
  secured.put('/api/admin/v1/products/:id',{bodyLimit:128*1024},async req=>adminCatalog.save(await actor(req.cookies[staffCookie]),id(req.params),req.body));
  secured.post('/api/admin/v1/products/:id/publish',async req=>adminCatalog.publish(await actor(req.cookies[staffCookie]),id(req.params),req.body));
  secured.post('/api/admin/v1/products/:id/unpublish',async req=>adminCatalog.unpublish(await actor(req.cookies[staffCookie]),id(req.params),req.body));
  secured.post('/api/admin/v1/products/:id/remove',async req=>adminCatalog.remove(await actor(req.cookies[staffCookie]),id(req.params),req.body));
  secured.post('/api/admin/v1/products/:id/stock',async req=>adminCatalog.stock(await actor(req.cookies[staffCookie]),id(req.params),req.body));
  secured.get('/api/admin/v1/products/:id/history',async req=>adminCatalog.history(id(req.params)));
 });
 app.post('/api/store/v1/analytics/events',{bodyLimit:8192},async req=>new ProductAnalytics(options.db).ingest(req.body));
 app.post('/api/store/v1/cart/pricing',async req=>{
  if(!promoApplicationEnabled&&req.body&&typeof req.body==='object'&&'promoCode' in req.body&&req.body.promoCode)throw new DomainError('PROMO_APPLICATION_DISABLED',409);
  const quote={...await cartPricing(options.db.pool,req.body),promoApplicationEnabled};
  try{
   const user=await auth.session(req.cookies[cookieName]);
   const loyalty=await new Loyalty(options.db).account(user.id);
   return {...quote,loyalty:{cashbackPoints:loyaltyAmounts(quote.subtotalMinor,loyalty.balance,0,quote.settings.loyalty).cashbackPoints,balance:loyalty.balance,maximum:loyaltyAmounts(quote.subtotalMinor,loyalty.balance,0,quote.settings.loyalty).maximum,redemptionAvailable:false}};
  }catch(e){if(e instanceof DomainError&&e.code==='UNAUTHENTICATED')return {...quote,loyalty:null};throw e;}
 });
 app.get('/api/store/v1/banner',async()=>{const {revision,...banner}=await controls.banner();return banner;});
 app.get('/health/live',async()=>({status:'ok'}));
 if(options.cdekTracking)app.post('/api/integrations/cdek/:key',{config:{cdekWebhook:true}},async req=>{await options.cdekTracking!.service.webhook(req.body);return {ok:true};});
 app.post('/api/store/v1/yandex/checkout-link',async req=>{
  if(!yandexFeed)throw new DomainError('YANDEX_CHECKOUT_UNAVAILABLE',503);
  return yandexFeed.checkoutLink(req.body,z.uuid().parse(req.headers['idempotency-key']));
 });
 app.get('/api/store/v1/yandex/feed.xml',async(req,reply)=>{
  if(!yandexFeed)throw new DomainError('YANDEX_FEED_UNAVAILABLE',503);
  const result=await yandexFeed.render();return reply.header('cache-control','no-store').type('application/xml; charset=utf-8').send(result.xml);
 });
 // /api/v1 matches the server prefix in the published YCP OpenAPI contract.
 // Keep the existing explicit prefix for previous local integrations and tests.
 for(const base of ['/api/ycp/v1','/api/v1']){
  app.get(base+'/warehouses',{config:{ycp:true}},async req=>ycp!.warehouses(req.query));
  app.post(base+'/checkout/basket/check',{config:{ycp:true}},async req=>ycp!.basket(req.body));
  app.post(base+'/checkout',{config:{ycp:true}},async(req,reply)=>reply.status(201).send(await ycpCheckout!.create(req.body)));
  app.post(base+'/checkout/placed',{config:{ycp:true}},async req=>ycpCheckout!.placed(req.body,req.query));
  app.post(base+'/checkout/cancel',{config:{ycp:true}},async req=>{z.object({}).strict().parse(req.body??{});return ycpCheckout!.cancel(req.query);});
  app.get(base+'/order',{config:{ycp:true}},async req=>ycpOrders!.get(req.query));
  app.post(base+'/order/delivered',{config:{ycp:true}},async req=>ycpOrders!.delivered(req.query,req.body));
  app.post(base+'/order/cancel',{config:{ycp:true}},async req=>{z.object({}).strict().parse(req.body??{});return ycpOrders!.cancel(req.query);});
 }
 app.get('/health/ready',async()=>{await options.db.pool.query('SELECT 1');return {status:'ok',stage:'foundation'};});
 app.get('/api/store/v1/products',async()=>({globalSalesEnabled:(await controls.sales()).enabled,items:await commerce.catalog(true)}));
 app.get('/api/store/v1/content/:page',async req=>siteContent.publicPage(z.object({page:z.string().max(50)}).parse(req.params).page));
 app.get('/api/store/v1/reviews/:sku',async req=>engagement.publicReviews(z.object({sku:z.string()}).parse(req.params).sku,z.object({offset:z.coerce.number().optional()}).parse(req.query).offset??0));
 app.get('/api/store/v1/media/:id',async(req,reply)=>{
  const {id}=z.object({id:z.uuid()}).parse(req.params);const image=await media.get(id,req.query);
  return reply.type('image/webp').header('Cache-Control','public, max-age=31536000, immutable')
   .header('Cross-Origin-Resource-Policy','same-origin').header('ETag','"'+image.contentHash+'"').send(image.content);
 });
 app.get('/api/store/v1/auth/methods',async()=>({yandex:!!customerYandex,orders:options.deploymentMode!=='ycp'||smsEnabled,...(smsEnabled?{sms:true}:{})}));
 app.post('/api/store/v1/auth/yandex/start',async(req,reply)=>{
  if(!customerYandex)throw new DomainError('YANDEX_LOGIN_UNAVAILABLE',503);
  z.object({}).strict().parse(req.body);
  const started=await customerYandex.start(req.ip);
  reply.setCookie(flowCookie,started.browser,flowCookieOptions);
  return {url:started.url};
 });
 app.get(yandexCallbackPath,async(req,reply)=>{
  reply.header('Referrer-Policy','no-referrer');
  reply.clearCookie(flowCookie,flowCookieOptions);
  if(!customerYandex)return reply.redirect('/account/?login=unavailable',303);
  try{
   const session=await customerYandex.finish(req.query,req.cookies[flowCookie],req.cookies[cookieName]);
   reply.setCookie(cookieName,session.token,cookieOptions);
   return reply.redirect('/account/',303);
  }catch(error){
   // Only fixed, harmless outcome labels reach the browser. Never reflect code,
   // state, provider errors or exception details into the URL or application log.
   req.log.warn({requestId:req.id,errorKind:'CUSTOMER_LOGIN_FAILED'},'Customer sign-in did not complete');
   const reason=error instanceof DomainError&&error.code==='YANDEX_LOGIN_CANCELLED'?'cancelled':'error';
   return reply.redirect('/account/?login='+reason,303);
  }
 });
 app.post('/api/store/v1/auth/sms-consent/status',async req=>{const {destination}=z.object({destination:z.string().max(30)}).strict().parse(req.body);return auth.consentStatus(destination,req.ip);});
 app.post('/api/store/v1/auth/otp/request',async req=>{
  const body=z.object({channel:z.enum(['email','sms']),destination:z.string().max(254),consent:smsConsentInput.optional()}).strict().parse(req.body);
  return auth.request(body.channel,body.destination,req.ip,body.consent);
 });
 app.post('/api/store/v1/auth/otp/verify',async(req,reply)=>{
  const body=z.object({challengeId:z.uuid(),code:z.string().regex(/^\d{6}$/)}).strict().parse(req.body);
  const session=await auth.verify(body.challengeId,body.code,req.ip);
  reply.setCookie(cookieName,session.token,cookieOptions);
  return {user:session.user,csrfToken:session.csrf};
 });
 app.get('/api/store/v1/auth/me',async req=>{
  const user=await auth.session(req.cookies[cookieName]);
  const csrfToken=auth.csrfToken(req.cookies[cookieName]!);
  // Development sessions created before recoverable CSRF support must sign in again.
  if(!equal(user.csrf_hash,hash(csrfToken))) throw new DomainError('UNAUTHENTICATED',401);
  return {id:user.id,role:user.role,csrfToken};
 });
 await app.register(async protectedApp=>{
  protectedApp.addHook('preHandler',async req=>{
   const user=await auth.session(req.cookies[cookieName]);
   if(req.method!=='GET') {
    const csrf=req.headers['x-csrf-token'];
    if(typeof csrf!=='string'||!equal(user.csrf_hash,hash(csrf))) throw new DomainError('CSRF_REJECTED',403);
   }
  });
  protectedApp.post('/api/store/v1/auth/logout',async(req,reply)=>{
   await auth.logout(req.cookies[cookieName]!);reply.clearCookie(cookieName,cookieOptions);return {ok:true};
  });
  protectedApp.get('/api/store/v1/account/engagement',async req=>engagement.account((await auth.session(req.cookies[cookieName])).id));
  protectedApp.post('/api/store/v1/account/reviews',async req=>engagement.submit((await auth.session(req.cookies[cookieName])).id,req.body));
  protectedApp.post('/api/store/v1/account/referral',async req=>engagement.attach((await auth.session(req.cookies[cookieName])).id,req.body));
  protectedApp.get('/api/store/v1/account/loyalty',async req=>{const user=await auth.session(req.cookies[cookieName]);await account.claim(user.id);return new Loyalty(options.db).account(user.id);});
  protectedApp.get('/api/store/v1/account/profile',async req=>{const user=await auth.session(req.cookies[cookieName]);return account.profile(user.id);});
  protectedApp.put('/api/store/v1/account/profile',async req=>{const user=await auth.session(req.cookies[cookieName]);return account.save(user.id,req.body);});
  protectedApp.post('/api/store/v1/delivery/quotes',async req=>{
   const user=await auth.session(req.cookies[cookieName]);return delivery.quote(user.id,req.body);
  });
  protectedApp.get('/api/store/v1/checkouts/by-key/:key',async req=>{
   const user=await auth.session(req.cookies[cookieName]);const {key}=z.object({key:z.string()}).parse(req.params);
   return commerce.checkoutByKey(user.id,key);
  });
  protectedApp.post('/api/store/v1/checkouts',async(req,reply)=>{
   const user=await auth.session(req.cookies[cookieName]);
   const key=z.string().parse(req.headers['idempotency-key']);
   const result=await commerce.createCheckout(user.id,key,req.body);reply.status(201);return result;
  });
  protectedApp.get('/api/store/v1/orders',async req=>{
   const user=await auth.session(req.cookies[cookieName]);if(smsEnabled)await account.claim(user.id);return commerce.orders(user.id,req.query);
  });
  protectedApp.get('/api/store/v1/orders/:id',async req=>{
   const user=await auth.session(req.cookies[cookieName]);const {id}=z.object({id:z.uuid()}).parse(req.params);
   if(smsEnabled)await account.claim(user.id);
   const order=await commerce.order(user.id,id);
   await options.cdekTracking?.service.requestStale(id,user.id);
   return order;
  });
  protectedApp.post('/api/store/v1/orders/:id/cancel',async req=>{
   const user=await auth.session(req.cookies[cookieName]);const {id}=z.object({id:z.uuid()}).parse(req.params);
   await commerce.cancel(user.id,id);return {ok:true};
  });
 });
 return app;
}
