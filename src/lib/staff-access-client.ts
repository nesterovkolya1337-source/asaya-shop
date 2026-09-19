import {createStoreRequest,AuthClientError} from './auth-client.ts';
import {parseStaffSession} from './admin-client.ts';
export type Employee={id:string;name:string;email:string;role:'owner'|'administrator'|'manager';status:'pending'|'active'|'disabled';twoFactor:boolean;lastLogin:string|null};
export type Invite={email:string;temporaryPassword:string;expiresAt:string};
type Activation={stage:'password'|'totp';csrfToken:string};
function object(r:unknown):Record<string,unknown>{if(!r||typeof r!=='object')throw new AuthClientError('INVALID_RESPONSE');return r as Record<string,unknown>;}
function activation(r:unknown):Activation{const v=object(r);if(!['password','totp'].includes(String(v.stage))||typeof v.csrfToken!=='string'||!/^[a-f0-9]{64}$/.test(v.csrfToken))throw new AuthClientError('INVALID_RESPONSE');return v as Activation;}
function invite(r:unknown):Invite{const v=object(r);if(typeof v.email!=='string'||typeof v.temporaryPassword!=='string'||typeof v.expiresAt!=='string')throw new AuthClientError('INVALID_RESPONSE');return v as Invite;}
export function accessTxt(v:Invite,adminUrl:string){const url=new URL(adminUrl);if(!['https:','http:'].includes(url.protocol))throw new AuthClientError('INVALID_INPUT');url.search='';url.hash='';return `ASAYA — доступ сотрудника\nEmail: ${v.email}\nВременный пароль: ${v.temporaryPassword}\nВход: ${url.href}\nДействует до: ${v.expiresAt}\n\nВыберите «Первый вход / восстановление доступа». Замените пароль и подключите своё приложение-аутентификатор. Пароль одноразовый.\n`;}
export function createStaffAccessClient(base:string,fetcher:typeof fetch=fetch){
 const request=createStoreRequest(base,fetcher);
 return {
  async list(){const r=object(await request('employees','GET'));if(!Array.isArray(r.items))throw new AuthClientError('INVALID_RESPONSE');return r.items as Employee[];},
  async create(input:{name:string;email:string;role:string},csrf:string){return invite(await request('employees','POST',input,csrf));},
  async change(id:string,action:string,csrf:string,role?:string){const r=object(await request('employees/'+encodeURIComponent(id),'POST',{action,confirmed:true,...(role?{role}:{})},csrf));if(r.ok!==true)throw new AuthClientError('INVALID_RESPONSE');return r.temporaryPassword?invite(r):null;},
  async start(email:string,password:string){return activation(await request('auth/activate/start','POST',{email:email.trim().toLowerCase(),password}));},
  async me(){try{return activation(await request('auth/activate/me','GET'));}catch(e){if(e instanceof AuthClientError&&e.code==='UNAUTHENTICATED')return null;throw e;}},
  async password(password:string,csrf:string){const r=object(await request('auth/activate/password','POST',{password},csrf));if(r.stage!=='totp')throw new AuthClientError('INVALID_RESPONSE');},
  async setup(){const r=object(await request('auth/activate/setup','GET'));if(typeof r.secret!=='string'||!/^[A-Z2-7]{32}$/.test(r.secret)||typeof r.qrSvg!=='string'||!r.qrSvg.startsWith('<svg'))throw new AuthClientError('INVALID_RESPONSE');return {secret:r.secret,qrSvg:r.qrSvg};},
  async confirm(code:string,csrf:string){const r=object(await request('auth/activate/confirm','POST',{code},csrf));if(!Array.isArray(r.recoveryCodes)||r.recoveryCodes.length!==10||!r.recoveryCodes.every(c=>typeof c==='string'&&/^[A-F0-9-]+$/.test(c)))throw new AuthClientError('INVALID_RESPONSE');return {session:parseStaffSession(r),recoveryCodes:r.recoveryCodes as string[]};}
 };
}
