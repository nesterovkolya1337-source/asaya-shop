import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {Database,type Tx} from './db.js';
import {DomainError} from './core.js';

export const marketingSchema=z.object({replenishment:z.record(z.uuid(),z.union([z.literal(0),z.literal(30),z.literal(45),z.literal(60),z.literal(90)])).optional(),loyalty:z.object({cashbackPercent:z.number().int().min(0).max(100),maxRedemptionPercent:z.number().int().min(0).max(100)}).strict().optional(),twoPercent:z.number().int().min(0).max(100),threePercent:z.number().int().min(0).max(100),freeShippingMinor:z.number().int().min(0).max(100000000)}).strict();
export type MarketingConfig=z.infer<typeof marketingSchema>;
export async function liveMarketing(db:Pick<Tx,'query'>):Promise<MarketingConfig>{
 return marketingSchema.parse((await db.query('SELECT live FROM marketing_settings WHERE id=true')).rows[0]?.live);
}
export class Marketing {
 constructor(private db:Database){}
 async read(){return (await this.db.pool.query('SELECT revision,defaults,draft,live FROM marketing_settings WHERE id=true')).rows[0];}
 async change(actor:string,action:'save'|'publish'|'restore'|'defaults',raw:unknown){
  const body=z.object({revision:z.number().int().nonnegative(),settings:marketingSchema.optional(),confirmed:z.literal(true).optional()}).strict().parse(raw);
  if((action==='save'||action==='defaults')&&!body.settings)throw new DomainError('INVALID_INPUT',400);
  if(action==='defaults'&&!body.confirmed)throw new DomainError('CONFIRMATION_REQUIRED',400);
  return this.db.transaction(async tx=>{
   const staff=(await tx.query(`SELECT c.staff_role FROM users u JOIN staff_credentials c ON c.user_id=u.id
    WHERE u.id=$1 AND u.role='admin' AND NOT u.disabled AND c.status='active' AND c.deleted_at IS NULL FOR SHARE OF u,c`,[actor])).rows[0];
   if(!staff||action==='defaults'&&!['owner','administrator'].includes(staff.staff_role))throw new DomainError('FORBIDDEN',403);
   const row=(await tx.query('SELECT * FROM marketing_settings WHERE id=true FOR UPDATE')).rows[0];
   if(row.revision!==body.revision)throw new DomainError('REVISION_CONFLICT',409);
   const field=action==='publish'?'live':action==='defaults'?'defaults':'draft';
   const settings=action==='publish'?row.draft:action==='restore'?row.defaults:{...body.settings,replenishment:body.settings?.replenishment??row[field].replenishment,loyalty:body.settings?.loyalty??row[field].loyalty??{cashbackPercent:3,maxRedemptionPercent:20}};
   await tx.query(`UPDATE marketing_settings SET ${field}=$1,revision=revision+1 WHERE id=true`,[settings]);
   await tx.query("INSERT INTO audit_log(id,actor_id,action,entity_id,detail) VALUES($1,$2,$3,'marketing',$4)",[randomUUID(),actor,'marketing.'+action,JSON.stringify({before:row[field],after:settings})]);
   return (await tx.query('SELECT revision,defaults,draft,live FROM marketing_settings WHERE id=true')).rows[0];
  });
 }
}
