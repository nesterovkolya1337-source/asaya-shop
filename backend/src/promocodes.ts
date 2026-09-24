import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {Database,type Tx} from './db.js';
import {DomainError,money} from './core.js';

export const normalizePromo=(v:string)=>v.replace(/\s+/gu,'').toUpperCase();
const code=z.string().max(100).transform(normalizePromo).pipe(z.string().regex(/^[A-ZА-ЯЁ0-9_-]{1,40}$/u));
export const promoSettings=z.object({kind:z.enum(['percent','fixed']),value:z.number().int().nonnegative().max(1e10),
 active:z.boolean(),startsAt:z.iso.datetime().nullable(),endsAt:z.iso.datetime().nullable(),
 minimumMinor:z.number().int().nonnegative().max(1e12),usageLimit:z.number().int().positive().max(1e9).nullable()
}).strict().refine(p=>p.kind!=='percent'||p.value<=100).refine(p=>!p.startsAt||!p.endsAt||p.startsAt<=p.endsAt);
export type PromoSettings=z.infer<typeof promoSettings>;
export function validatePromo(p:PromoSettings,total:number,used:number,now=new Date()){
 if(!p.active)throw new DomainError('PROMO_INACTIVE',409);
 if(p.startsAt&&Date.parse(p.startsAt)>now.getTime())throw new DomainError('PROMO_NOT_STARTED',409);
 if(p.endsAt&&Date.parse(p.endsAt)<=now.getTime())throw new DomainError('PROMO_EXPIRED',409);
 if(total<p.minimumMinor)throw new DomainError('PROMO_MINIMUM',409);
 if(p.usageLimit!==null&&used>=p.usageLimit)throw new DomainError('PROMO_LIMIT',409);
}
// Allocate whole kopecks by line value, then largest remainder with canonical SKU tie-break.
// The result is a preview snapshot; do not infer YCP unit prices or order identity from it.
export function allocatePromo(lines:Array<{sku:string;quantity:number;unitMinor:number}>,p:PromoSettings){
 const amounts=lines.map(l=>money(l.quantity*l.unitMinor)),total=money(amounts.reduce((a,b)=>a+b,0));
 const discount=Math.min(total,p.kind==='fixed'?p.value:Number(BigInt(total)*BigInt(p.value)/BigInt(100)));
 const parts=amounts.map((amount,i)=>({i,minor:total?Number(BigInt(amount)*BigInt(discount)/BigInt(total)):0,remainder:total?BigInt(amount)*BigInt(discount)%BigInt(total):BigInt(0),sku:lines[i]!.sku}));
 let remaining=discount-parts.reduce((a,b)=>a+b.minor,0);
 for(const part of [...parts].sort((a,b)=>a.remainder===b.remainder?(a.sku<b.sku?-1:a.sku>b.sku?1:0):a.remainder>b.remainder?-1:1)){if(remaining<=0)break;part.minor++;remaining--;}
 return {discountMinor:discount,subtotalMinor:total-discount,allocations:parts.map(p=>({sku:p.sku,discountMinor:p.minor,lineMinor:amounts[p.i]!-p.minor}))};
}
export class Promocodes{
 constructor(private db:Database){}
 async list(){return {checkoutAvailable:false,items:(await this.db.pool.query('SELECT p.*, (SELECT count(*)::int FROM promocode_usages u WHERE u.promo_id=p.id) AS uses FROM promocodes p ORDER BY p.created_at DESC,p.id')).rows};}
 async save(actor:string,id:string,raw:unknown){
  z.uuid().parse(id);const d=z.object({revision:z.number().int().nonnegative(),code,settings:promoSettings}).strict().parse(raw);
  try{return await this.db.transaction(async tx=>{
   if(!(await tx.query("SELECT 1 FROM users WHERE id=$1 AND role='admin' AND NOT disabled FOR SHARE",[actor])).rowCount)throw new DomainError('FORBIDDEN',403);
   const old=(await tx.query('SELECT * FROM promocodes WHERE id=$1 FOR UPDATE',[id])).rows[0];
   if((old?.revision??0)!==d.revision)throw new DomainError('EDIT_CONFLICT',409);
   if(old&&old.code!==d.code&&(await tx.query('SELECT 1 FROM promocode_usages WHERE promo_id=$1 LIMIT 1',[id])).rowCount)throw new DomainError('PROMO_CODE_IMMUTABLE',409);
   await tx.query('INSERT INTO promocodes(id,code,settings) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET code=excluded.code,settings=excluded.settings,revision=promocodes.revision+1,updated_at=now()',[id,d.code,JSON.stringify(d.settings)]);
   await tx.query('INSERT INTO audit_log(id,actor_id,action,entity_id,detail) VALUES($1,$2,$3,$4,$5)',[randomUUID(),actor,!old?'promo.created':old.settings.active&&!d.settings.active?'promo.disabled':'promo.updated',id,JSON.stringify({before:old?{code:old.code,settings:old.settings}:null,after:{code:d.code,settings:d.settings}})]);
   return {id,revision:d.revision+1};
  });}catch(e){if((e as {code?:string}).code==='23505')throw new DomainError('PROMO_CODE_EXISTS',409);throw e;}
 }
}
export async function applyPromo(db:Pick<Tx,'query'>,input:string,lines:Array<{sku:string;quantity:number;unitMinor:number}>,now=new Date()){
 const normalized=code.parse(input),row=(await db.query('SELECT p.*, (SELECT count(*)::int FROM promocode_usages u WHERE u.promo_id=p.id) AS uses FROM promocodes p WHERE code=$1',[normalized])).rows[0];
 if(!row)throw new DomainError('PROMO_NOT_FOUND',409);
 const settings=promoSettings.parse(row.settings),total=money(lines.reduce((a,l)=>a+l.unitMinor*l.quantity,0));validatePromo(settings,total,row.uses,now);
 return {id:row.id,code:row.code,revision:row.revision,settings,...allocatePromo(lines,settings),checkoutAvailable:false as const};
}
