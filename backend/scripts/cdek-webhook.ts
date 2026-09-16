import {open,readFile,mkdir,rename,unlink} from 'node:fs/promises';
import {dirname,isAbsolute} from 'node:path';
import {randomUUID} from 'node:crypto';
import {Database} from '../src/db.js';
import {CdekDeliveryClient,cdekTrackingFromEnv} from '../src/cdek-delivery.js';
import {setupCdekWebhook,type CdekWebhookSetupState} from '../src/cdek-webhook-setup.js';
import {DomainError} from '../src/core.js';

// No webhooks or orders are created when this command is run with --status.
// Secrets stay in the server environment; stdout never contains the callback URL.
async function main(){
 const args=process.argv.slice(2);
 if(args.length!==1||!['--status','--ensure'].includes(args[0]!))throw new DomainError('USE_STATUS_OR_ENSURE',400);
 const mode=args[0]==='--ensure'?'ensure':'status';
 const c=cdekTrackingFromEnv({...process.env,CDEK_TRACKING_ENABLED:'true'})!;
 const origin=process.env.PUBLIC_ORIGIN;
 const stateFile=process.env.CDEK_WEBHOOK_STATE_FILE;
 if(!origin||!stateFile||!isAbsolute(stateFile))throw new DomainError('CDEK_WEBHOOK_SETUP_CONFIG_REQUIRED',400);
 if(mode==='ensure'&&process.env.CDEK_WEBHOOK_ENDPOINT_VERIFIED!=='true')throw new DomainError('CDEK_WEBHOOK_ENDPOINT_NOT_VERIFIED');
 const store={
  async read(){try{return JSON.parse(await readFile(stateFile,'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return undefined;throw e;}},
  async save(state:CdekWebhookSetupState){
   await mkdir(dirname(stateFile),{recursive:true,mode:0o700});
   const temporary=stateFile+'.'+randomUUID()+'.tmp';
   const handle=await open(temporary,'wx',0o600);
   try{await handle.writeFile(JSON.stringify(state)+'\n','utf8');await handle.sync();}finally{await handle.close();}
   try{await rename(temporary,stateFile);}finally{await unlink(temporary).catch(()=>{});}
   // Persist the rename on Linux, where production runs.
   if(process.platform!=='win32'){const dir=await open(dirname(stateFile),'r');try{await dir.sync();}finally{await dir.close();}}
  },
 };
 const api=new CdekDeliveryClient(c.settings),binding={account:c.settings.account,environment:c.settings.environment,origin,secret:c.secret};
 if(mode==='status')return setupCdekWebhook(api,store,binding,mode);
 if(!process.env.DATABASE_URL)throw new DomainError('DATABASE_URL_REQUIRED',400);
 const db=new Database(process.env.DATABASE_URL);
 try{
  const connection=await db.pool.connect();
  const key='asaya.cdek.webhook.setup:'+c.settings.environment+':'+c.settings.account;
  try{
   const lock=await connection.query('SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS acquired',[key]);
   if(!lock.rows[0]?.acquired)throw new DomainError('CDEK_WEBHOOK_SETUP_BUSY');
   try{return await setupCdekWebhook(api,store,binding,mode);}
   finally{await connection.query('SELECT pg_advisory_unlock(hashtextextended($1,0))',[key]);}
  }finally{connection.release();}
 }finally{await db.close();}
}
try{const result=await main();console.log(JSON.stringify({event:'cdek.webhook_setup',...result}));if(result.status!=='active')process.exitCode=2;}
catch(error){console.error(JSON.stringify({event:'cdek.webhook_setup_failed',code:error instanceof DomainError?error.code:'CDEK_WEBHOOK_SETUP_FAILED'}));process.exitCode=1;}
