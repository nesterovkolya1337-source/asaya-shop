import {randomBytes,randomUUID,createHash,createHmac,createCipheriv,createDecipheriv,scrypt} from 'node:crypto';
import {z} from 'zod';
import {Database,lock} from './db.js';
import {DomainError,equal,hash,mac} from './core.js';
const emailSchema=z.email().max(254).transform(v=>v.toLowerCase());
const passwordSchema=z.string().min(14).max(256);
export function decodeBase32(value:string):Buffer {
 if(!/^[A-Z2-7]{32,128}$/.test(value))throw new Error('Invalid authenticator key');
 let buffer=0,bits=0;const out:number[]=[];
 for(const char of value){buffer=(buffer<<5)|'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(char);bits+=5;if(bits>=8){bits-=8;out.push((buffer>>>bits)&255);}}
 return Buffer.from(out);
}
export function totp(key:Buffer,step:number,digits=6):string {
 const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(step));
 const digest=createHmac('sha1',key).update(counter).digest(),offset=digest[digest.length-1]!&15;
 return String((digest.readUInt32BE(offset)&0x7fffffff)%10**digits).padStart(digits,'0');
}
const derive=(password:string,salt:string)=>new Promise<string>((resolve,reject)=>{
 scrypt(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024},(error,result)=>error?reject(error):resolve(result.toString('hex')));
});
export class StaffAuth {
 constructor(private db:Database,private secret:string,private clock=()=>new Date()){if(secret.length<32)throw new Error('Staff secret must be at least 32 characters');}
 private encryptionKey(){return createHash('sha256').update('staff-totp:'+this.secret).digest();}
 private seal(value:string){
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',this.encryptionKey(),iv);
  const body=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
  return [iv,cipher.getAuthTag(),body].map(b=>b.toString('base64url')).join('.');
 }
 private open(value:string){
  const [iv,tag,body]=value.split('.').map(s=>Buffer.from(s,'base64url'));
  if(!iv||!tag||!body)throw new Error('Invalid encrypted credential');
  const cipher=createDecipheriv('aes-256-gcm',this.encryptionKey(),iv);cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(body),cipher.final()]).toString('utf8');
 }
 // Provisioning is CLI-only; no HTTP endpoint can create or elevate a staff account.
 async provision(email:string,password:string,totpSecret:string){
  email=emailSchema.parse(email.trim());passwordSchema.parse(password);decodeBase32(totpSecret);
  const salt=randomBytes(16).toString('hex'),passwordHash=await derive(password,salt),id=randomUUID();
  return this.db.transaction(async tx=>{
   await lock(tx,'staff-provision:'+email);
   if((await tx.query('SELECT 1 FROM staff_credentials WHERE email=$1',[email])).rowCount)throw new DomainError('STAFF_ALREADY_EXISTS');
   await tx.query("INSERT INTO users(id,role) VALUES($1,'admin')",[id]);
   await tx.query('INSERT INTO staff_credentials(user_id,email,password_salt,password_hash,totp_encrypted) VALUES($1,$2,$3,$4,$5)',[id,email,salt,passwordHash,this.seal(totpSecret)]);
   await tx.query("INSERT INTO audit_log(id,actor_id,action,entity_id) VALUES($1,$2,'staff.provisioned',$3)",[randomUUID(),id,id]);
   return id;
  });
 }
 private async limit(key:string,max:number){
  const now=this.clock();await this.db.transaction(async tx=>{
   await lock(tx,key);const r=(await tx.query('SELECT * FROM rate_limits WHERE bucket_key=$1',[key])).rows[0];
   if(r&&now.getTime()-new Date(r.window_start).getTime()<900000){
    if(r.count>=max)throw new DomainError('RATE_LIMITED',429);
    await tx.query('UPDATE rate_limits SET count=count+1 WHERE bucket_key=$1',[key]);
   }else await tx.query('INSERT INTO rate_limits(bucket_key,window_start,count) VALUES($1,$2,1) ON CONFLICT(bucket_key) DO UPDATE SET window_start=excluded.window_start,count=1',[key,now]);
  });
 }
 async login(raw:unknown,ip:string){
  const {email,password,code}=z.object({email:emailSchema,password:z.string().max(256),code:z.string().regex(/^\d{6}$/)}).strict().parse(raw);
  await this.limit('staff-ip:'+mac(this.secret,ip),30);await this.limit('staff-email:'+mac(this.secret,email),10);
  const row=(await this.db.pool.query('SELECT * FROM staff_credentials WHERE email=$1',[email])).rows[0];
  const candidate=await derive(password,row?.password_salt??'missing-account-dummy-salt');
  if(!row||!equal(candidate,row.password_hash))throw new DomainError('INVALID_STAFF_LOGIN',401);
  const now=this.clock(),step=Math.floor(now.getTime()/30000);
  const totpKey=decodeBase32(this.open(row.totp_encrypted));
  const matched=[step-1,step,step+1].find(s=>s>=0&&equal(totp(totpKey,s),code));
  if(matched===undefined)throw new DomainError('INVALID_STAFF_LOGIN',401);
  return this.db.transaction(async tx=>{
   const current=(await tx.query('SELECT c.last_totp_step,u.role,u.disabled FROM staff_credentials c JOIN users u ON u.id=c.user_id WHERE c.user_id=$1 FOR UPDATE OF c,u',[row.user_id])).rows[0];
   if(!current||current.disabled||current.role!=='admin'||matched<=Number(current.last_totp_step))throw new DomainError('INVALID_STAFF_LOGIN',401);
   await tx.query('UPDATE staff_credentials SET last_totp_step=$2 WHERE user_id=$1',[row.user_id,matched]);
   const token=randomBytes(32).toString('base64url');
   await tx.query('INSERT INTO staff_sessions(token_hash,user_id,created_at,expires_at) VALUES($1,$2,$3,$4)',[hash(token),row.user_id,now,new Date(now.getTime()+3600000)]);
   await tx.query("INSERT INTO audit_log(id,actor_id,action,entity_id) VALUES($1,$2,'staff.login',$3)",[randomUUID(),row.user_id,row.user_id]);
   return {token,user:{id:row.user_id as string,role:'admin' as const},csrfToken:this.csrf(token)};
  });
 }
 csrf(token:string){return mac(this.secret,'staff-csrf:'+token);}
 async session(token:string|undefined){
  if(!token||token.length>200)throw new DomainError('UNAUTHENTICATED',401);
  const row=(await this.db.pool.query("SELECT u.id FROM staff_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>$2 AND NOT u.disabled AND u.role='admin'",[hash(token),this.clock()])).rows[0];
  if(!row)throw new DomainError('UNAUTHENTICATED',401);
  return {user:{id:row.id as string,role:'admin' as const},csrfToken:this.csrf(token)};
 }
 async logout(token:string){await this.db.pool.query('UPDATE staff_sessions SET revoked_at=$2 WHERE token_hash=$1',[hash(token),this.clock()]);}
}
