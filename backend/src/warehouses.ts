import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {Database,lock,type Tx} from './db.js';
import {DomainError} from './core.js';
import type {YcpSettings} from './ycp-catalog.js';

type Queryable=Pick<Tx,'query'>;
export type WarehouseProfile={warehouseId:string;title?:string;address:string;phone:string;description?:string;servedLocalities:string[];ycpDeliveryEnabled:boolean};

// No provider network calls belong in YCP requests: use the backend's stock ledger.
export async function ycpWarehouses(db:Queryable,settings:YcpSettings,orderableOnly=false,holdLock=false):Promise<WarehouseProfile[]>{
 if(settings.warehouseSource!=='database')return settings.warehouses;
 const {rows}=await db.query(`SELECT w.id,w.name,p.address_line,p.phone,p.description,p.served_localities
  FROM warehouses w JOIN warehouse_profiles p ON p.warehouse_id=w.id
  WHERE w.active AND p.ycp_export_enabled AND (NOT $1 OR p.can_fulfill)
  ORDER BY w.id${holdLock?' FOR SHARE OF w,p':''}`,[orderableOnly]);
 return rows.map(r=>({warehouseId:r.id,title:r.name,address:r.address_line,phone:r.phone,description:r.description,
  servedLocalities:r.served_localities,ycpDeliveryEnabled:false}));
}

const text=(max:number)=>z.string().trim().max(max);
export const warehouseEdit=z.object({
 revision:z.number().int().nonnegative(),name:text(200).min(1),active:z.boolean(),
 address:text(500),phone:text(100),description:text(1000),
 ycpExportEnabled:z.boolean(),canFulfill:z.boolean(),
 servedLocalities:z.array(text(200).min(1)).max(1000)
}).strict().refine(d=>!d.canFulfill||(d.address.length>0&&d.phone.length>0&&d.servedLocalities.length>0),{message:'Dispatch requires the actual warehouse address, phone and delivery area'});

export class Warehouses {
 constructor(private db:Database){}
 async list(){
  const {rows}=await this.db.pool.query(`SELECT w.id,w.code,w.name,w.active,p.revision,p.address_line,p.phone,p.description,
   p.ycp_export_enabled,p.can_fulfill,p.served_localities,
   COALESCE((SELECT jsonb_agg(jsonb_build_object('provider',e.provider,'accountId',e.account_id,'externalId',e.external_id,
    'parentCode',e.parent_code,'syncStatus',e.sync_status,'lastStockSyncAt',e.last_stock_sync_at) ORDER BY e.provider,e.account_id)
    FROM warehouse_external_ids e WHERE e.warehouse_id=w.id),'[]'::jsonb) AS bindings
   FROM warehouses w JOIN warehouse_profiles p ON p.warehouse_id=w.id ORDER BY w.code`);
  return {items:rows.map(r=>({id:r.id,code:r.code,name:r.name,active:r.active,revision:r.revision,address:r.address_line,
   phone:r.phone,description:r.description,ycpExportEnabled:r.ycp_export_enabled,canFulfill:r.can_fulfill,
   servedLocalities:r.served_localities,bindings:r.bindings}))};
 }
 async save(actor:string,id:string,raw:unknown){
  z.uuid().parse(id);const d=warehouseEdit.parse(raw);
  return this.db.transaction(async tx=>{
   if(!(await tx.query("SELECT 1 FROM users WHERE id=$1 AND role='admin' AND NOT disabled FOR SHARE",[actor])).rowCount)throw new DomainError('FORBIDDEN',403);
   const prior=(await tx.query(`SELECT p.revision FROM warehouses w JOIN warehouse_profiles p ON p.warehouse_id=w.id WHERE w.id=$1 FOR UPDATE OF w,p`,[id])).rows[0];
   if(!prior)throw new DomainError('WAREHOUSE_NOT_FOUND',404);
   if(prior.revision!==d.revision)throw new DomainError('EDIT_CONFLICT');
   await tx.query('UPDATE warehouses SET name=$2,active=$3 WHERE id=$1',[id,d.name,d.active]);
   await tx.query(`UPDATE warehouse_profiles SET revision=revision+1,address_line=$2,phone=$3,description=$4,
    ycp_export_enabled=$5,can_fulfill=$6,served_localities=$7,updated_at=now() WHERE warehouse_id=$1`,
    [id,d.address,d.phone,d.description,d.ycpExportEnabled,d.canFulfill,[...new Set(d.servedLocalities)]]);
   await tx.query('INSERT INTO audit_log(id,actor_id,action,entity_id,detail) VALUES($1,$2,$3,$4,$5)',
    [randomUUID(),actor,'warehouse.updated',id,JSON.stringify({revision:d.revision+1,canFulfill:d.canFulfill,ycpExportEnabled:d.ycpExportEnabled})]);
   return {id,revision:d.revision+1};
  });
 }
}

// Owner confirmed MSK2290/23401 on 2026-09-09. Address and phone were read
// from authenticated CDEK /v2/deliverypoints?code=MSK2290 (fulfillment=true).
// Identity verification does not assert that any merchandise has been received.
export const onboardingWarehouses=[
 {id:'18d1c0ba-86e3-46c9-8a08-ad555326bc62',code:'cdek-ff-23401',name:'СДЭК Фулфилмент — Москва (MSK2290)',externalId:'23401',parentCode:'MSK2290',city:'Москва',
  address:'105187, Россия, Москва, Москва, ул. 1-я Измайловского Зверинца, 8',phone:'+79585004191'}
] as const;

export async function ensureOnboardingWarehouses(db:Database){
 return db.transaction(async tx=>{
  await lock(tx,'asaya:warehouse-onboarding');
  const result=[];
  for(const w of onboardingWarehouses){
   const existing=(await tx.query('SELECT id,code FROM warehouses WHERE id=$1 OR code=$2 FOR UPDATE',[w.id,w.code])).rows;
   if(existing.length&&(existing.length!==1||existing[0].id!==w.id||existing[0].code!==w.code))throw new DomainError('WAREHOUSE_ID_CONFLICT');
   if(!existing.length){
    await tx.query('INSERT INTO warehouses(id,code,name,active,address) VALUES($1,$2,$3,true,$4)',[w.id,w.code,w.name,JSON.stringify({country:'Россия',city:w.city,addressLine:w.address,locationStatus:'verified_cdek_api'})]);
   }
   await tx.query(`INSERT INTO warehouse_profiles(warehouse_id,address_line,phone,description,ycp_export_enabled)
    VALUES($1,$2,$3,'Склад товаров ASAYA на СДЭК Фулфилмент MSK2290.',true)
    ON CONFLICT(warehouse_id) DO NOTHING`,[w.id,w.address,w.phone]);
   const binding=(await tx.query(`SELECT external_id,warehouse_id FROM warehouse_external_ids
    WHERE provider='cdek_ff' AND account_id='asaya' AND (external_id=$1 OR warehouse_id=$2) FOR UPDATE`,[w.externalId,w.id])).rows;
   if(binding.length&&(binding.length!==1||binding[0].warehouse_id!==w.id||binding[0].external_id!==w.externalId))throw new DomainError('WAREHOUSE_BINDING_CONFLICT');
   if(!binding.length)await tx.query(`INSERT INTO warehouse_external_ids(provider,account_id,external_id,warehouse_id,parent_code)
    VALUES('cdek_ff','asaya',$1,$2,$3)`,[w.externalId,w.id,w.parentCode]);
   result.push({id:w.id,externalId:w.externalId,created:!existing.length});
  }
  return {items:result};
 });
}
