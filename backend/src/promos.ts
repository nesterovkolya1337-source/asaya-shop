import {randomBytes,randomUUID} from 'node:crypto';
import {z} from 'zod';
import {Database,type Tx} from './db.js';
import {DomainError} from './core.js';
const code=z.string().trim().min(1).max(40).transform(v=>v.toUpperCase()).pipe(z.string().regex(/^[A-ZА-ЯЁ0-9][A-ZА-ЯЁ0-9_-]*$/u));
const date=z.iso.datetime({offset:true}).nullable().default(null);
const limit=z.number().int().min(1).max(100000000).nullable();
export const promoSchema=z.object({code,discount_percent:z.number().int().min(1).max(100),starts_at:date,ends_at:date,is_active:z.boolean().default(true),allow_repeat_use:z.boolean().default(false),max_total_uses:limit.default(null),max_uses_per_customer:limit.optional(),label:z.string().trim().max(300).default('')}).strict().transform(v=>({...v,max_uses_per_customer:v.allow_repeat_use?(v.max_uses_per_customer??null):1})).refine(v=>!v.starts_at||!v.ends_at||Date.parse(v.starts_at)<Date.parse(v.ends_at),{message:'Конец действия должен быть позже начала'});
export type PromoInput=z.infer<typeof promoSchema>;
type Query=Pick<Tx,'query'>;
async function staff(tx:Query,actor:string){if(!(await tx.query("SELECT 1 FROM users u JOIN staff_credentials c ON c.user_id=u.id WHERE u.id=$1 AND u.role='admin' AND NOT u.disabled AND c.status='active' AND c.deleted_at IS NULL",[actor])).rowCount)throw new DomainError('FORBIDDEN',403);}
async function audit(tx:Query,actor:string,action:string,id:string){await tx.query('INSERT INTO audit_log(id,actor_id,action,entity_id,detail) VALUES($1,$2,$3,$4,$5)',[randomUUID(),actor,'promo.'+action,id,{}]);}
export function promoFailure(p:{is_active:boolean;archived_at:unknown;starts_at:Date|string|null;ends_at:Date|string|null;max_total_uses:number|null;max_uses_per_customer:number|null},used:number,customerUsed:number,hasCustomer:boolean,now=new Date()){
 if(!p.is_active||p.archived_at)return 'PROMO_DISABLED';
 if(p.starts_at&&new Date(p.starts_at)>now)return 'PROMO_NOT_STARTED';
 if(p.ends_at&&new Date(p.ends_at)<=now)return 'PROMO_EXPIRED';
 if(p.max_total_uses!==null&&used>=p.max_total_uses)return 'PROMO_EXHAUSTED';
 if(p.max_uses_per_customer!==null&&!hasCustomer)return 'PROMO_LOGIN_REQUIRED';
 if(p.max_uses_per_customer!==null&&customerUsed>=p.max_uses_per_customer)return 'PROMO_CUSTOMER_EXHAUSTED';
 return null;
}
export async function validatedPromo(db:Query,raw:string,customerId:string|null,now=new Date()){
 const normalized=code.safeParse(raw);if(!normalized.success)throw new DomainError('PROMO_NOT_FOUND',404);
 const p=(await db.query(`SELECT p.*,(SELECT count(*)::int FROM promo_paid_uses u WHERE u.promo_id=p.id) used,
 (SELECT count(*)::int FROM promo_paid_uses u WHERE u.promo_id=p.id AND u.customer_id=$2) customer_used FROM promo_codes p WHERE code=$1`,[normalized.data,customerId])).rows[0];
 if(!p)throw new DomainError('PROMO_NOT_FOUND',404);
 const failure=promoFailure(p,p.used,p.customer_used,!!customerId,now);if(failure)throw new DomainError(failure,409);
 return {id:p.id as string,code:p.code as string,percent:p.discount_percent as number};
}
export const csvColumns=['code','discount_percent','starts_at','ends_at','is_active','allow_repeat_use','max_total_uses','max_uses_per_customer','label'];
export const promoTemplate='\ufeff'+csvColumns.join(',')+'\r\nWELCOME10,10,,,true,false,,,Пример: первая покупка\r\n';
// Bounded RFC4180 subset; quoted commas/newlines and Excel BOM are supported.
export function parsePromoCsv(input:string){
 if(input.length>500000)throw new DomainError('PROMO_CSV_TOO_LARGE',400);
 const rows:string[][]=[];let row:string[]=[],cell='',quoted=false,closed=false;
 const s=input.replace(/^\ufeff/,'');
 for(let i=0;i<s.length;i++) {const c=s[i]!;
  if(quoted){if(c==='"'){if(s[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;continue;}
  if(c==='"'){if(cell||closed)throw new DomainError('PROMO_CSV_INVALID',400);quoted=true;continue;}
  if(c===','||c==='\n'||c==='\r'){row.push(cell);cell='';closed=false;if(c!==','){if(c==='\r'&&s[i+1]==='\n')i++;if(row.some(v=>v!==''))rows.push(row);row=[];}continue;}
  if(closed)throw new DomainError('PROMO_CSV_INVALID',400);cell+=c;
 }
 if(quoted)throw new DomainError('PROMO_CSV_INVALID',400);
 row.push(cell);if(row.some(v=>v!==''))rows.push(row);
 if(rows.length>501||JSON.stringify(rows.shift())!==JSON.stringify(csvColumns))throw new DomainError('PROMO_CSV_INVALID',400);
 return rows;
}
export class Promos {
 constructor(private db:Database,private clock=()=>new Date()){}
 async list(actor:string,raw:unknown){await staff(this.db.pool,actor);const q=z.object({view:z.enum(['active','archive']).default('active'),search:z.string().max(100).default(''),offset:z.coerce.number().int().min(0).default(0)}).parse(raw);
 const where=`(p.archived_at IS NOT NULL OR NOT p.is_active OR COALESCE(p.ends_at<=$1,false))=$2 AND (strpos(lower(p.code),lower($3))>0 OR strpos(lower(p.label),lower($3))>0)`;
 const params=[this.clock(),q.view==='archive',q.search];
 const count=Number((await this.db.pool.query('SELECT count(*) n FROM promo_codes p WHERE '+where,params)).rows[0].n);
 const items=(await this.db.pool.query(`SELECT p.*,(SELECT count(*)::int FROM promo_paid_uses u WHERE u.promo_id=p.id) used,
 (SELECT coalesce(sum(u.discount_minor),0)::text FROM promo_paid_uses u WHERE u.promo_id=p.id) discount_total_minor FROM promo_codes p WHERE ${where} ORDER BY p.created_at DESC,p.id LIMIT 100 OFFSET $4`,[...params,q.offset])).rows;
 return {items,total:count,nextOffset:q.offset+items.length<count?q.offset+items.length:null};
 }
 async generate(actor:string){await staff(this.db.pool,actor);for(let i=0;i<10;i++){const value=randomBytes(5).toString('hex').toUpperCase();if(!(await this.db.pool.query('SELECT 1 FROM promo_codes WHERE code=$1',[value])).rowCount)return {code:value};}throw new DomainError('PROMO_GENERATION_FAILED',503);}
 private async insert(tx:Tx,actor:string,p:PromoInput){const id=randomUUID();const r=await tx.query(`INSERT INTO promo_codes(id,code,discount_percent,starts_at,ends_at,is_active,allow_repeat_use,max_total_uses,max_uses_per_customer,label)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(code) DO NOTHING RETURNING id`,[id,p.code,p.discount_percent,p.starts_at,p.ends_at,p.is_active,p.allow_repeat_use,p.max_total_uses,p.max_uses_per_customer,p.label]);if(!r.rowCount)throw new DomainError('PROMO_DUPLICATE',409);await audit(tx,actor,'created',id);return {id};}
 async save(actor:string,raw:unknown,id?:string){const p=promoSchema.parse(raw);return this.db.transaction(async tx=>{await staff(tx,actor);if(!id)return this.insert(tx,actor,p);z.uuid().parse(id);
 const current=(await tx.query('SELECT * FROM promo_codes WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!current)throw new DomainError('PROMO_NOT_FOUND',404);if(current.code!==p.code)throw new DomainError('PROMO_CODE_IMMUTABLE',409);
 if(p.is_active&&p.ends_at&&new Date(p.ends_at)<=this.clock())throw new DomainError('PROMO_EXPIRED',409);
 await tx.query('UPDATE promo_codes SET discount_percent=$2,starts_at=$3,ends_at=$4,is_active=$5,allow_repeat_use=$6,max_total_uses=$7,max_uses_per_customer=$8,label=$9,archived_at=CASE WHEN $5 THEN NULL ELSE archived_at END,revision=revision+1,updated_at=now() WHERE id=$1',[id,p.discount_percent,p.starts_at,p.ends_at,p.is_active,p.allow_repeat_use,p.max_total_uses,p.max_uses_per_customer,p.label]);await audit(tx,actor,'updated',id);return {id};});}
 async bulk(actor:string,raw:unknown){const b=z.object({ids:z.array(z.uuid()).min(1).max(100),action:z.enum(['disable','archive']),confirmed:z.literal(true)}).strict().parse(raw);return this.db.transaction(async tx=>{await staff(tx,actor);const ids=[...new Set(b.ids)];const r=await tx.query("UPDATE promo_codes SET is_active=false,archived_at=CASE WHEN $2='archive' THEN now() ELSE archived_at END,revision=revision+1,updated_at=now() WHERE id=ANY($1::uuid[]) RETURNING id",[ids,b.action]);if(r.rowCount!==ids.length)throw new DomainError('PROMO_NOT_FOUND',404);for(const id of ids)await audit(tx,actor,b.action,id);return {count:ids.length};});}
 async preview(actor:string,csv:string){await staff(this.db.pool,actor);return this.previewRows(this.db.pool,csv);}
 private async previewRows(db:Query,csv:string){const rows=parsePromoCsv(csv),seen=new Set<string>(),exists=new Set((await db.query('SELECT code FROM promo_codes WHERE code=ANY($1::text[])',[rows.map(r=>(r[0]??'').trim().toUpperCase())])).rows.map(r=>r.code));return rows.map((r,i)=>{try{
 if(r.length!==csvColumns.length)throw Error('Неверное число колонок');
 const boolean=(s:string,def:boolean)=>s===''?def:s==='true'?true:s==='false'?false:(()=>{throw Error('Используйте true или false');})();
 const n=(s:string)=>s===''?null:/^\d+$/.test(s)?Number(s):NaN;
 const result=promoSchema.safeParse({code:r[0],discount_percent:n(r[1]!),starts_at:r[2]||null,ends_at:r[3]||null,is_active:boolean(r[4]!,true),allow_repeat_use:boolean(r[5]!,false),max_total_uses:n(r[6]!),max_uses_per_customer:n(r[7]!),label:r[8]});
 if(!result.success)throw Error('Некорректный код, процент, дата или лимит');const p=result.data;
 if(seen.has(p.code)||exists.has(p.code))throw Error('Промокод уже существует или повторяется в файле');seen.add(p.code);return {row:i+2,data:p,error:null};
 }catch(e){return {row:i+2,data:null,error:(e as Error).message};}});}
 async import(actor:string,raw:unknown){const b=z.object({csv:z.string().max(500000),rows:z.array(z.number().int().min(2)).min(1).max(500),confirmed:z.literal(true)}).strict().parse(raw);return this.db.transaction(async tx=>{await staff(tx,actor);const preview=await this.previewRows(tx,b.csv),selected=[...new Set(b.rows)].map(n=>preview.find(r=>r.row===n));if(selected.some(r=>!r?.data))throw new DomainError('PROMO_IMPORT_CHANGED',409);for(const r of selected)await this.insert(tx,actor,r!.data!);return {count:selected.length};});}
}
