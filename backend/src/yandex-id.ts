import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {z} from 'zod';
import {Database,lock} from './db.js';
import {hash,mac,DomainError} from './core.js';

export const yandexCallbackPath='/api/store/v1/auth/yandex/callback';
export type YandexIdentity={subject:string};
export interface YandexIdentityProvider {
 authorize(state:string,verifier:string):string;
 identify(code:string,verifier:string):Promise<YandexIdentity>;
}
export function pkceChallenge(verifier:string){return createHash('sha256').update(verifier).digest('base64url');}

// Fixed provider endpoints. Tokens never reach the browser, logs or database.
export class YandexIdProvider implements YandexIdentityProvider {
 constructor(readonly clientId:string,readonly origin:string,private fetcher:typeof fetch=fetch){
  z.string().regex(/^[a-f0-9]{32}$/i).parse(clientId);
  const url=new URL(origin);
  if(url.origin!==origin||url.protocol!=='https:')throw new Error('Yandex ID requires a canonical HTTPS origin');
 }
 authorize(state:string,verifier:string){
  const url=new URL('https://oauth.yandex.ru/authorize');
  url.search=new URLSearchParams({response_type:'code',client_id:this.clientId,redirect_uri:this.origin+yandexCallbackPath,
   scope:'login:info',state,code_challenge:pkceChallenge(verifier),code_challenge_method:'S256',force_confirm:'yes'}).toString();
  return url.href;
 }
 async identify(code:string,verifier:string):Promise<YandexIdentity>{
  const signal=AbortSignal.timeout(8000);
  const read=async(url:string,options:RequestInit)=>{
   const response=await this.fetcher(url,{...options,redirect:'error',signal});
   if(!response.ok||!response.body)throw new Error('Provider unavailable');
   const reader=response.body.getReader();const parts:Uint8Array[]=[];let size=0;
   try{for(;;){const item=await reader.read();if(item.done)break;size+=item.value.byteLength;if(size>32768)throw new Error('Provider response too large');parts.push(item.value);}}
   finally{await reader.cancel();}
   return JSON.parse(Buffer.concat(parts).toString('utf8')) as unknown;
  };
  try{
   // Yandex documents client_id + PKCE without client_secret for this exchange.
   const raw=await read('https://oauth.yandex.ru/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({grant_type:'authorization_code',client_id:this.clientId,code,code_verifier:verifier})});
   const token=z.object({token_type:z.string().regex(/^bearer$/i),access_token:z.string().min(1).max(4096).regex(/^[\x21-\x7e]+$/)}).parse(raw);
   const profile=z.object({id:z.string().regex(/^\d{1,40}$/),client_id:z.literal(this.clientId)}).parse(
    await read('https://login.yandex.ru/info?format=json',{headers:{Authorization:'OAuth '+token.access_token}}));
   return {subject:profile.id};
  }catch{throw new DomainError('YANDEX_LOGIN_UNAVAILABLE',503);}
 }
}

export class CustomerYandexAuth {
 constructor(private db:Database,private secret:string,private clientId:string,private provider:YandexIdentityProvider,private clock=()=>new Date()){
  if(secret.length<32)throw new Error('Customer authentication secret too short');
 }
 private verifier(state:string,browser:string){return mac(this.secret,'yandex-pkce:'+state+':'+browser);}
 async start(ip:string){
  const at=this.clock(),state=randomBytes(32).toString('base64url'),browser=randomBytes(32).toString('base64url');
  await this.db.transaction(async tx=>{
   const key='yandex-login:'+mac(this.secret,ip);await lock(tx,key);
   const row=(await tx.query('SELECT window_start,count FROM rate_limits WHERE bucket_key=$1',[key])).rows[0];
   if(row&&at.getTime()-new Date(row.window_start).getTime()<300000){
    if(row.count>=120)throw new DomainError('RATE_LIMITED',429);
    await tx.query('UPDATE rate_limits SET count=count+1 WHERE bucket_key=$1',[key]);
   }else await tx.query('INSERT INTO rate_limits(bucket_key,window_start,count) VALUES($1,$2,1) ON CONFLICT(bucket_key) DO UPDATE SET window_start=excluded.window_start,count=1',[key,at]);
   await tx.query('DELETE FROM customer_oauth_states WHERE expires_at<=$1',[at]);
   await tx.query('INSERT INTO customer_oauth_states(state_hash,browser_hash,client_id,expires_at) VALUES($1,$2,$3,$4)',
    [hash(state),hash(browser),this.clientId,new Date(at.getTime()+600000)]);
  });
  return {url:this.provider.authorize(state,this.verifier(state,browser)),browser};
 }
 async finish(raw:unknown,browser:unknown,previousSession?:string){
  const input=z.object({state:z.string().regex(/^[A-Za-z0-9_-]{43}$/),code:z.string().min(1).max(2048).optional(),
   error:z.string().max(200).optional(),error_description:z.string().max(2000).optional(),cid:z.string().max(200).optional()}).strict().parse(raw);
  if(typeof browser!=='string'||! /^[A-Za-z0-9_-]{43}$/.test(browser))throw new DomainError('YANDEX_LOGIN_INVALID',400);
  // Consume before the network call: callbacks, failures and concurrent replays are one-use.
  const used=await this.db.pool.query('DELETE FROM customer_oauth_states WHERE state_hash=$1 AND browser_hash=$2 AND client_id=$3 AND expires_at>$4 RETURNING state_hash',
   [hash(input.state),hash(browser),this.clientId,this.clock()]);
  if(!used.rowCount)throw new DomainError('YANDEX_LOGIN_INVALID',400);
  if(input.error||!input.code)throw new DomainError('YANDEX_LOGIN_CANCELLED',400);
  const identity=await this.provider.identify(input.code,this.verifier(input.state,browser));
  z.string().min(1).max(200).parse(identity.subject);
  return this.db.transaction(async tx=>{
   await lock(tx,'yandex-identity:'+this.clientId+':'+identity.subject);
   let linked=(await tx.query("SELECT user_id FROM customer_oauth_identities WHERE provider='yandex' AND client_id=$1 AND subject=$2",[this.clientId,identity.subject])).rows[0];
   if(!linked){
    linked={user_id:randomUUID()};
    await tx.query("INSERT INTO users(id,role) VALUES($1,'customer')",[linked.user_id]);
    await tx.query("INSERT INTO customer_oauth_identities(provider,client_id,subject,user_id) VALUES('yandex',$1,$2,$3)",[this.clientId,identity.subject,linked.user_id]);
   }
   const user=(await tx.query('SELECT id,role,disabled FROM users WHERE id=$1 FOR SHARE',[linked.user_id])).rows[0];
   if(!user||user.disabled||user.role!=='customer')throw new DomainError('YANDEX_LOGIN_INVALID',403);
   const token=randomBytes(32).toString('base64url'),csrf=mac(this.secret,'csrf:'+token),at=this.clock();
   await tx.query('INSERT INTO auth_sessions(token_hash,user_id,csrf_hash,created_at,expires_at) VALUES($1,$2,$3,$4,$5)',[hash(token),user.id,hash(csrf),at,new Date(at.getTime()+7*86400000)]);
   if(previousSession&&previousSession.length<=200)await tx.query('UPDATE auth_sessions SET revoked_at=$2 WHERE token_hash=$1',[hash(previousSession),at]);
   await tx.query("UPDATE customer_oauth_identities SET last_login_at=$3 WHERE provider='yandex' AND client_id=$1 AND subject=$2",[this.clientId,identity.subject,at]);
   // Do not attach OTP identities, staff accounts or guest orders by email.
   return {token,csrf,user:{id:user.id as string,role:'customer' as const}};
  });
 }
}
