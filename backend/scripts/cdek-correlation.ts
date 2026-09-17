import {readFile} from 'node:fs/promises';
import {Database} from '../src/db.js';
import {DomainError} from '../src/core.js';
import {CdekDeliveryClient,cdekTrackingFromEnv} from '../src/cdek-delivery.js';
import {CdekCorrelation} from '../src/cdek-correlation.js';
import {parseYcpSettings} from '../src/ycp-catalog.js';
async function main(){
 const [mode,orderId,trackingNumber,confirmation,...extra]=process.argv.slice(2);
 if(!['--verify','--bind'].includes(mode??'')||!orderId||!trackingNumber||extra.length||mode==='--verify'&&confirmation||mode==='--bind'&&!confirmation)throw new DomainError('USE_VERIFY_OR_BIND_ORDER_UUID_TRACKING_CONFIRMED_NUMBER',400);
 const config=cdekTrackingFromEnv(process.env);
 if(!config||!process.env.DATABASE_URL||!process.env.YCP_SETTINGS_FILE)throw new DomainError('CDEK_TRACKING_CONFIG_REQUIRED',400);
 const ycp=parseYcpSettings(JSON.parse(await readFile(process.env.YCP_SETTINGS_FILE,'utf8')),true);
 if(ycp.environment!==config.settings.environment)throw new DomainError('CDEK_CORRELATION_SCOPE_MISMATCH',409);
 const db=new Database(process.env.DATABASE_URL);
 try{const service=new CdekCorrelation(db,new CdekDeliveryClient(config.settings),{ycpAccountId:ycp.accountId,deliveryAccountId:config.settings.account,environment:ycp.environment});
  return mode==='--verify'?await service.verify(orderId,trackingNumber):await service.bind(orderId,trackingNumber,confirmation!);
 }finally{await db.close();}
}
try{console.log(JSON.stringify(await main()));}catch(e){console.error(JSON.stringify({event:'cdek.correlation_failed',code:e instanceof DomainError?e.code:'CDEK_CORRELATION_FAILED'}));process.exitCode=1;}
