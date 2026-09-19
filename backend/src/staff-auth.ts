import {randomBytes,randomUUID,createHash,createHmac,createCipheriv,createDecipheriv,scrypt} from 'node:crypto';
import {z} from 'zod';
import {Database,lock,type Tx} from './db.js';
import qrcode from 'qrcode-generator';
export const TRUSTED_SECONDS=90*86400;
export const OWNER_EMAIL='asayacosmetics@yandex.ru';
export type StaffRole='owner'|'administrator'|'manager';
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
 // Existing CLI bootstrap remains available; HTTP employees always require personal activation.
 async provision(email:string,password:string,totpSecret:string){
  email=emailSchema.parse(email.trim());passwordSchema.parse(password);decodeBase32(totpSecret);
  const salt=randomBytes(16).toString('hex'),passwordHash=await derive(password,salt),id=randomUUID();
  return this.db.transaction(async tx=>{
   await lock(tx,'staff-provision:'+email);
   if((await tx.query('SELECT 1 FROM staff_credentials WHERE email=$1',[email])).rowCount)throw new DomainError('STAFF_ALREADY_EXISTS');
   await tx.query("INSERT INTO users(id,role) VALUES($1,'admin')",[id]);
   await tx.query('INSERT INTO staff_credentials(user_id,email,password_salt,password_hash,totp_encrypted) VALUES($1,$2,$3,$4,$5)',[id,email,salt,passwordHash,this.seal(totpSecret)]);
   await tx.query('UPDATE staff_credentials SET staff_role=$2 WHERE user_id=$1',[id,email===OWNER_EMAIL?'owner':'administrator']);
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
 private async trusted(tx:Tx,id:string,staffRole:StaffRole){
  const now=this.clock(),token=randomBytes(32).toString('base64url');
  await tx.query('INSERT INTO staff_sessions(token_hash,user_id,created_at,expires_at) VALUES($1,$2,$3,$4)',[hash(token),id,now,new Date(now.getTime()+TRUSTED_SECONDS*1000)]);
  await tx.query('UPDATE staff_credentials SET last_login_at=$2 WHERE user_id=$1',[id,now]);
  return {token,user:{id,role:'admin' as const,staffRole},csrfToken:this.csrf(token)};
 }
 async login(raw:unknown,ip:string){
  const {email,password,code}=z.object({email:emailSchema,password:z.string().max(256),code:z.string().min(6).max(64)}).strict().parse(raw);
  await this.limit('staff-ip:'+mac(this.secret,ip),30);await this.limit('staff-email:'+mac(this.secret,email),10);
  const row=(await this.db.pool.query('SELECT * FROM staff_credentials WHERE email=$1',[email])).rows[0];
  const candidate=await derive(password,row?.password_salt??'missing-account-dummy-salt');
  if(!row||!equal(candidate,row.password_hash)||row.status!=='active'||row.deleted_at)throw new DomainError('INVALID_STAFF_LOGIN',401);
  const now=this.clock(),step=Math.floor(now.getTime()/30000),totpKey=decodeBase32(this.open(row.totp_encrypted));
  const matched=/^\d{6}$/.test(code)?[step-1,step,step+1].find(s=>s>=0&&equal(totp(totpKey,s),code)):undefined;
  const recovery=code.toUpperCase().replace(/-/g,'');
  return this.db.transaction(async tx=>{
   const current=(await tx.query('SELECT c.*,u.role,u.disabled FROM staff_credentials c JOIN users u ON u.id=c.user_id WHERE c.user_id=$1 FOR UPDATE OF c,u',[row.user_id])).rows[0];
   if(!current||current.disabled||current.role!=='admin'||current.status!=='active'||current.deleted_at||!equal(current.password_hash,row.password_hash))throw new DomainError('INVALID_STAFF_LOGIN',401);
   if(matched!==undefined){
    if(matched<=Number(current.last_totp_step))throw new DomainError('INVALID_STAFF_LOGIN',401);
    await tx.query('UPDATE staff_credentials SET last_totp_step=$2 WHERE user_id=$1',[row.user_id,matched]);
   }else{
    if(!/^[A-F0-9]{20}$/.test(recovery)||(await tx.query('UPDATE staff_recovery_codes SET used_at=$3 WHERE user_id=$1 AND code_hash=$2 AND used_at IS NULL RETURNING code_hash',[row.user_id,hash(recovery),now])).rowCount!==1)throw new DomainError('INVALID_STAFF_LOGIN',401);
   }
   await tx.query("INSERT INTO audit_log(id,actor_id,action,entity_id) VALUES($1,$2,'staff.login',$3)",[randomUUID(),row.user_id,row.user_id]);
   return this.trusted(tx,row.user_id,current.staff_role);
  });
 }
 csrf(token:string){return mac(this.secret,'staff-csrf:'+token);}
 async session(token:string|undefined){
  if(!token||token.length>200)throw new DomainError('UNAUTHENTICATED',401);
  const now=this.clock();
  const row=(await this.db.pool.query(`UPDATE staff_sessions s SET expires_at=$3 FROM users u,staff_credentials c WHERE s.user_id=u.id AND c.user_id=u.id AND s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>$2 AND NOT u.disabled AND u.role='admin' AND c.status='active' AND c.deleted_at IS NULL RETURNING u.id,c.staff_role`,[hash(token),now,new Date(now.getTime()+TRUSTED_SECONDS*1000)])).rows[0];
  if(!row)throw new DomainError('UNAUTHENTICATED',401);
  return {user:{id:row.id as string,role:'admin' as const,staffRole:row.staff_role as StaffRole},csrfToken:this.csrf(token)};
 }
 async logout(token:string){await this.db.pool.query('UPDATE staff_sessions SET revoked_at=$2 WHERE token_hash=$1',[hash(token),this.clock()]);}
 private async elevated(tx:Tx,actor:string){
  const row=(await tx.query("SELECT c.staff_role FROM staff_credentials c JOIN users u ON u.id=c.user_id WHERE c.user_id=$1 AND c.status='active' AND c.deleted_at IS NULL AND NOT u.disabled AND u.role='admin' FOR SHARE OF c,u",[actor])).rows[0];
  if(!row||!['owner','administrator'].includes(row.staff_role))throw new DomainError('FORBIDDEN',403);
 }
 async employees(actor:string){return this.db.transaction(async tx=>{
  await this.elevated(tx,actor);
  return {items:(await tx.query(`SELECT user_id AS id,name,email,staff_role AS role,status,(totp_encrypted<>'') AS "twoFactor",last_login_at AS "lastLogin" FROM staff_credentials WHERE deleted_at IS NULL ORDER BY email`)).rows};
 });}
 async createEmployee(actor:string,raw:unknown){
  const {name,email,role}=z.object({name:z.string().trim().min(1).max(150),email:emailSchema,role:z.enum(['administrator','manager'])}).strict().parse(raw);
  if(email===OWNER_EMAIL)throw new DomainError('OWNER_PROTECTED',403);
  const temporaryPassword=randomBytes(18).toString('base64url'),salt=randomBytes(16).toString('hex'),passwordHash=await derive(temporaryPassword,salt),id=randomUUID(),expiresAt=new Date(this.clock().getTime()+7*86400000);
  return this.db.transaction(async tx=>{
   await lock(tx,'staff-management');await this.elevated(tx,actor);
   if((await tx.query('SELECT 1 FROM staff_credentials WHERE email=$1',[email])).rowCount)throw new DomainError('STAFF_ALREADY_EXISTS',409);
   await tx.query("INSERT INTO users(id,role) VALUES($1,'admin')",[id]);
   await tx.query("INSERT INTO staff_credentials(user_id,email,name,staff_role,status,password_salt,password_hash,totp_encrypted,temporary_expires_at) VALUES($1,$2,$3,$4,'pending',$5,$6,'',$7)",[id,email,name,role,salt,passwordHash,expiresAt]);
   await tx.query("INSERT INTO audit_log(id,actor_id,action,entity_id) VALUES($1,$2,'staff.created',$3)",[randomUUID(),actor,id]);
   return {id,email,temporaryPassword,expiresAt:expiresAt.toISOString()};
  });
 }
 async changeEmployee(actor:string,id:string,raw:unknown){
  z.uuid().parse(id);const input=z.object({action:z.enum(['role','disable','enable','delete','reset']),role:z.enum(['administrator','manager']).optional(),confirmed:z.literal(true)}).strict().parse(raw);
  if(input.action==='role'&&!input.role)throw new DomainError('INVALID_INPUT');
  const temporaryPassword=input.action==='reset'?randomBytes(18).toString('base64url'):undefined,salt=randomBytes(16).toString('hex'),passwordHash=temporaryPassword?await derive(temporaryPassword,salt):undefined;
  return this.db.transaction(async tx=>{
   await lock(tx,'staff-management');await this.elevated(tx,actor);
   const row=(await tx.query('SELECT * FROM staff_credentials WHERE user_id=$1 FOR UPDATE',[id])).rows[0];
   if(!row||row.deleted_at)throw new DomainError('STAFF_NOT_FOUND',404);
   if(row.staff_role==='owner'||row.email===OWNER_EMAIL)throw new DomainError('OWNER_PROTECTED',403);
   if(input.action==='role')await tx.query('UPDATE staff_credentials SET staff_role=$2 WHERE user_id=$1',[id,input.role]);
   else if(input.action==='enable'){
    if(!row.totp_encrypted)throw new DomainError('STAFF_RESET_REQUIRED',409);
    await tx.query("UPDATE staff_credentials SET status='active' WHERE user_id=$1",[id]);await tx.query('UPDATE users SET disabled=false WHERE id=$1',[id]);
   }else{
    await tx.query('UPDATE staff_sessions SET revoked_at=$2 WHERE user_id=$1 AND revoked_at IS NULL',[id,this.clock()]);
    await tx.query('UPDATE staff_activation_sessions SET revoked_at=$2 WHERE user_id=$1 AND revoked_at IS NULL',[id,this.clock()]);
    if(input.action==='reset'){
     const expiresAt=new Date(this.clock().getTime()+7*86400000);
     await tx.query("UPDATE staff_credentials SET status='pending',password_salt=$2,password_hash=$3,totp_encrypted='',last_totp_step=-1,temporary_expires_at=$4 WHERE user_id=$1",[id,salt,passwordHash,expiresAt]);
     await tx.query('UPDATE users SET disabled=false WHERE id=$1',[id]);await tx.query('DELETE FROM staff_recovery_codes WHERE user_id=$1',[id]);
    }else{
     await tx.query("UPDATE staff_credentials SET status='disabled',deleted_at=CASE WHEN $2 THEN $3 ELSE deleted_at END WHERE user_id=$1",[id,input.action==='delete',this.clock()]);
     await tx.query('UPDATE users SET disabled=true WHERE id=$1',[id]);
    }
   }
   await tx.query('INSERT INTO audit_log(id,actor_id,action,entity_id) VALUES($1,$2,$3,$4)',[randomUUID(),actor,'staff.'+input.action,id]);
   return {ok:true,...(temporaryPassword?{email:row.email as string,temporaryPassword,expiresAt:new Date(this.clock().getTime()+7*86400000).toISOString()}: {})};
  });
 }
 async activationStart(raw:unknown,ip:string){
  const {email,password}=z.object({email:emailSchema,password:z.string().max(256)}).strict().parse(raw);
  await this.limit('staff-ip:'+mac(this.secret,ip),30);await this.limit('staff-email:'+mac(this.secret,email),10);
  const row=(await this.db.pool.query('SELECT * FROM staff_credentials WHERE email=$1',[email])).rows[0];
  const candidate=await derive(password,row?.password_salt??'missing-account-dummy-salt');
  if(!row||!equal(candidate,row.password_hash))throw new DomainError('INVALID_STAFF_LOGIN',401);
  return this.db.transaction(async tx=>{
   const current=(await tx.query('SELECT c.*,u.disabled FROM staff_credentials c JOIN users u ON u.id=c.user_id WHERE c.user_id=$1 FOR UPDATE OF c,u',[row.user_id])).rows[0];
   if(current.disabled||current.deleted_at||current.status!=='pending'||!current.temporary_expires_at||new Date(current.temporary_expires_at)<=this.clock()||!equal(current.password_hash,row.password_hash))throw new DomainError('INVALID_STAFF_LOGIN',401);
   await tx.query('UPDATE staff_credentials SET temporary_expires_at=NULL WHERE user_id=$1',[row.user_id]);
   const token=randomBytes(32).toString('base64url');
   await tx.query("INSERT INTO staff_activation_sessions(token_hash,user_id,stage,expires_at) VALUES($1,$2,'password',$3)",[hash(token),row.user_id,new Date(this.clock().getTime()+15*60000)]);
   return {token,stage:'password' as const,csrfToken:this.csrf(token)};
  });
 }
 async activationSession(token:string|undefined){
  if(!token||token.length>200)throw new DomainError('UNAUTHENTICATED',401);
  const row=(await this.db.pool.query("SELECT s.*,c.email FROM staff_activation_sessions s JOIN staff_credentials c ON c.user_id=s.user_id JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>$2 AND c.status='pending' AND c.deleted_at IS NULL AND NOT u.disabled",[hash(token),this.clock()])).rows[0];
  if(!row)throw new DomainError('UNAUTHENTICATED',401);
  return {stage:row.stage as 'password'|'totp',csrfToken:this.csrf(token)};
 }
 async activationPassword(token:string,raw:unknown){
  const {password}=z.object({password:passwordSchema}).strict().parse(raw),salt=randomBytes(16).toString('hex'),passwordHash=await derive(password,salt);
  return this.db.transaction(async tx=>{
   await lock(tx,'staff-management');await this.activationSession(token);
   const session=(await tx.query('SELECT * FROM staff_activation_sessions WHERE token_hash=$1 FOR UPDATE',[hash(token)])).rows[0];
   const current=(await tx.query('SELECT * FROM staff_credentials WHERE user_id=$1 FOR UPDATE',[session.user_id])).rows[0];
   if(session.stage!=='password'||session.revoked_at||current.status!=='pending')throw new DomainError('INVALID_ACTIVATION',409);
   if(equal(await derive(password,current.password_salt),current.password_hash))throw new DomainError('NEW_PASSWORD_REQUIRED',400);
   const key=Array.from(randomBytes(32),b=>'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[b%32]).join('');
   await tx.query('UPDATE staff_credentials SET password_salt=$2,password_hash=$3 WHERE user_id=$1',[session.user_id,salt,passwordHash]);
   await tx.query("UPDATE staff_activation_sessions SET stage='totp',totp_encrypted=$2 WHERE token_hash=$1",[hash(token),this.seal(key)]);
   return {stage:'totp' as const};
  });
 }
 async activationSetup(token:string){
  const state=await this.activationSession(token);if(state.stage!=='totp')throw new DomainError('INVALID_ACTIVATION',409);
  const row=(await this.db.pool.query('SELECT s.totp_encrypted,c.email FROM staff_activation_sessions s JOIN staff_credentials c ON c.user_id=s.user_id WHERE s.token_hash=$1',[hash(token)])).rows[0];
  const secret=this.open(row.totp_encrypted),uri='otpauth://totp/'+encodeURIComponent('ASAYA:'+row.email)+'?secret='+secret+'&issuer=ASAYA&algorithm=SHA1&digits=6&period=30';
  const qr=qrcode(0,'M');qr.addData(uri);qr.make();
  return {secret,qrSvg:qr.createSvgTag({cellSize:4,margin:16,scalable:true})};
 }
 async activationConfirm(token:string,raw:unknown){
  const {code}=z.object({code:z.string().regex(/^\d{6}$/)}).strict().parse(raw);await this.limit('staff-activation:'+hash(token),10);
  return this.db.transaction(async tx=>{
   await lock(tx,'staff-management');await this.activationSession(token);
   const session=(await tx.query('SELECT * FROM staff_activation_sessions WHERE token_hash=$1 FOR UPDATE',[hash(token)])).rows[0];
   const current=(await tx.query('SELECT c.*,u.disabled FROM staff_credentials c JOIN users u ON u.id=c.user_id WHERE c.user_id=$1 FOR UPDATE OF c,u',[session.user_id])).rows[0];
   if(session.stage!=='totp'||session.revoked_at||current.disabled||current.status!=='pending')throw new DomainError('INVALID_ACTIVATION',409);
   const step=Math.floor(this.clock().getTime()/30000),key=decodeBase32(this.open(session.totp_encrypted)),matched=[step-1,step,step+1].find(s=>s>=0&&equal(totp(key,s),code));
   if(matched===undefined)throw new DomainError('INVALID_STAFF_LOGIN',401);
   const codes=Array.from({length:10},()=>randomBytes(10).toString('hex').toUpperCase());
   for(const c of codes)await tx.query('INSERT INTO staff_recovery_codes(user_id,code_hash) VALUES($1,$2)',[session.user_id,hash(c)]);
   await tx.query("UPDATE staff_credentials SET status='active',totp_encrypted=$2,last_totp_step=$3 WHERE user_id=$1",[session.user_id,session.totp_encrypted,matched]);
   await tx.query('UPDATE staff_activation_sessions SET revoked_at=$2,totp_encrypted=NULL WHERE user_id=$1',[session.user_id,this.clock()]);
   await tx.query("INSERT INTO audit_log(id,actor_id,action,entity_id) VALUES($1,$2,'staff.activated',$3)",[randomUUID(),session.user_id,session.user_id]);
   return {...await this.trusted(tx,session.user_id,current.staff_role),recoveryCodes:codes.map(c=>c.match(/.{4}/g)!.join('-'))};
  });
 }
}
