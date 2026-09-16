import { config } from './config.js';
import { Database } from './db.js';
import { buildApp } from './app.js';
import { DisabledOtpSender } from './auth.js';
import {SmsAeroSender} from './smsaero.js';
import {readFile} from 'node:fs/promises';
import {parseYcpSettings} from './ycp-catalog.js';
import {CommerceService} from './commerce.js';
import {runReservationWorker} from './reservation-worker.js';
import {CdekDeliveryClient} from './cdek-delivery.js';
import {OrderTracking} from './order-tracking.js';
import {runTrackingWorker} from './tracking-worker.js';
import {CdekFulfillmentClient} from './cdek-fulfillment.js';
import {FulfillmentDispatch,type FulfillmentBinding} from './fulfillment-dispatch.js';
import {runFulfillmentWorker} from './fulfillment-worker.js';
import {runRetentionWorker} from './retention-worker.js';
const c=config();
// config() keeps foundation mode out of production; ycp explicitly enables only
// the authenticated Yandex protocol, while its public buy button remains separate.
const ycp=c.YCP_TOKEN&&c.YCP_SETTINGS_FILE?{token:c.YCP_TOKEN,settings:JSON.parse(await readFile(c.YCP_SETTINGS_FILE,'utf8'))}:undefined;
const db=new Database(c.DATABASE_URL);
const tracking=c.cdekTracking?new OrderTracking(db,new CdekDeliveryClient(c.cdekTracking.settings),{accountId:c.cdekTracking.settings.account,environment:c.cdekTracking.settings.environment}):undefined;
const ffBinding:FulfillmentBinding|undefined=c.FULFILLMENT_ENABLED==='true'?JSON.parse(await readFile(c.FULFILLMENT_SETTINGS_FILE!,'utf8')):undefined;
if(ffBinding&&(!ycp||ffBinding.environment!==ycp.settings.environment||ffBinding.ycpAccountId!==ycp.settings.accountId||!c.cdekTracking||ffBinding.environment!==c.cdekTracking.settings.environment||ffBinding.deliveryAccountId!==c.cdekTracking.settings.account))throw new Error('Fulfillment must match the YCP and CDEK tracking accounts/environments');
const fulfillment=ffBinding?new FulfillmentDispatch(db,new CdekFulfillmentClient({login:c.FULFILLMENT_LOGIN!,password:c.FULFILLMENT_PASSWORD!,shopId:ffBinding.shopId,warehouseId:ffBinding.ffWarehouseId,senderId:ffBinding.senderId,environment:ffBinding.environment}),ffBinding):undefined;
const otpSender=c.customerSms.enabled&&c.customerSms.settings?new SmsAeroSender(c.customerSms.settings):new DisabledOtpSender();
const app=await buildApp({deploymentMode:c.DEPLOYMENT_MODE,db,otpSecret:c.OTP_SECRET,staffSecret:c.STAFF_SECRET,otpSender,customerSmsEnabled:c.customerSms.enabled,otpPolicy:c.otpPolicy,origin:new URL(c.PUBLIC_ORIGIN).origin,secureCookies:c.COOKIE_SECURE==='true',logger:true,ycp,yandexIdClientId:c.YANDEX_ID_CLIENT_ID,fulfillment,...(tracking?{cdekTracking:{service:tracking,secret:c.cdekTracking!.secret}}:{})});
const sweepController=new AbortController();let sweep:Promise<void>|undefined;
let trackingWorker:Promise<void>|undefined,fulfillmentWorker:Promise<void>|undefined,retentionWorker:Promise<void>|undefined;
app.addHook('onClose',async()=>{sweepController.abort();await Promise.allSettled([sweep,trackingWorker,fulfillmentWorker,retentionWorker]);await db.close();});
let closing=false;
const stop=async()=>{if(closing)return;closing=true;await app.close();};
process.on('SIGINT',()=>void stop());process.on('SIGTERM',()=>void stop());
try {await app.listen({host:c.HOST,port:c.PORT});} catch(e) {await app.close();throw e;}
if(tracking)trackingWorker=runTrackingWorker(tracking,sweepController.signal,report=>app.log.error(report));
if(fulfillment&&ffBinding)fulfillmentWorker=runFulfillmentWorker(db,fulfillment,ffBinding,sweepController.signal,report=>app.log.error(report));
if(c.UNPAID_RETENTION_ENABLED==='true'&&ycp)retentionWorker=runRetentionWorker(db,{accountId:ycp.settings.accountId,environment:ycp.settings.environment},sweepController.signal,report=>app.log.info(report));
if(c.DEPLOYMENT_MODE==='ycp'&&ycp){
 const settings=parseYcpSettings(ycp.settings,true);
 const commerce=new CommerceService(db,undefined,'production');
 sweep=runReservationWorker({expire:()=>commerce.expire({accountId:settings.accountId,environment:'production'}),
  signal:sweepController.signal,intervalMs:c.RESERVATION_SWEEP_INTERVAL_MS,
  report:report=>{if(report.event==='reservations.expiry_failed')app.log.error(report);else if(report.count)app.log.info(report);}
 });
}
