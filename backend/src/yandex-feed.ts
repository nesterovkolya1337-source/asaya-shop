import {ycpWarehouses} from './warehouses.js';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {Database,lock} from './db.js';
import {canonical,DomainError,money} from './core.js';
import {parseYcpSettings,type YcpSettings} from './ycp-catalog.js';

const categories:Record<string,{id:number;name:string}>={hair:{id:1,name:'Уход за волосами'},body:{id:2,name:'Уход за телом'},face:{id:3,name:'Уход за лицом'},sets:{id:4,name:'Наборы косметики'}};
const validOfferId=/^[A-Za-zА-Яа-я0-9.,/\\()[\]\-=]{1,80}$/;
export function xmlText(value:string){
 return Array.from(value).filter(c=>{const n=c.codePointAt(0)!;return n===9||n===10||n===13||(n>=32&&n<=0xd7ff)||(n>=0xe000&&n<=0xfffd)||(n>=0x10000&&n<=0x10ffff);}).join('').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
}
const tag=(name:string,value:string)=>`<${name}>${xmlText(value)}</${name}>`;
const rubles=(value:unknown)=>{const n=money(value);return `${Math.floor(n/100)}.${String(n%100).padStart(2,'0')}`;};
export class YandexFeed {
 private settings:YcpSettings;
 constructor(private db:Database,settings:unknown,private clock=()=>new Date(),allowProduction=false){
  this.settings=parseYcpSettings(settings,allowProduction);
 }
 async prepare(apply=false){
  const s=this.settings;
  return this.db.transaction(async tx=>{
   await lock(tx,canonical(['ycp-feed-mappings',s.accountId,s.environment]));
   const {rows}=await tx.query(`SELECT p.id,p.sku FROM products p JOIN product_editor e ON e.product_id=p.id AND e.published IS NOT NULL
    JOIN product_prices pr ON pr.product_id=p.id AND pr.approved
    WHERE p.active AND p.sale_approved AND EXISTS(SELECT 1 FROM storefront_mappings m WHERE m.product_id=p.id AND m.approved)
    AND NOT EXISTS(SELECT 1 FROM product_components c WHERE c.product_id=p.id) ORDER BY p.sku`);
   const changes=[];
   for(const row of rows){
    const existing=(await tx.query("SELECT external_id FROM product_external_ids WHERE provider='ycp' AND account_id=$1 AND environment=$2 AND product_id=$3 ORDER BY external_id",[s.accountId,s.environment,row.id])).rows;
    if(existing.length){changes.push({sku:row.sku,action:existing.length===1?'preserved':'ambiguous',offerId:existing.length===1?existing[0].external_id:null});continue;}
    const offerId=`asaya-${row.id}`;
    const conflict=(await tx.query("SELECT product_id FROM product_external_ids WHERE provider='ycp' AND account_id=$1 AND environment=$2 AND external_id=$3",[s.accountId,s.environment,offerId])).rows[0];
    if(conflict)throw new DomainError('YCP_OFFER_ID_CONFLICT');
    if(apply){
     await tx.query("INSERT INTO product_external_ids(provider,environment,account_id,external_id,product_id) VALUES('ycp',$1,$2,$3,$4)",[s.environment,s.accountId,offerId,row.id]);
     await tx.query("INSERT INTO audit_log(id,action,entity_id,detail) VALUES($1,'ycp.feed_mapping.created',$2,$3)",[randomUUID(),row.id,JSON.stringify({accountId:s.accountId,environment:s.environment,offerId})]);
    }
    changes.push({sku:row.sku,action:apply?'created':'would_create',offerId});
   }
   return {applied:apply,items:changes};
  });
 }
 async render(forCheckout=false){
  const s=this.settings;if(!s.feed)throw new DomainError('YANDEX_FEED_UNAVAILABLE',503);
  if(!xmlText(s.feed.name).trim()||!xmlText(s.feed.company).trim())throw new DomainError('YANDEX_FEED_SETTINGS_INVALID',503);
  const {rows}=await this.db.pool.query(`SELECT p.id,p.sku,p.name,p.weight_g,p.width_mm,p.height_mm,p.depth_mm,pr.regular_minor,pr.final_minor,e.published->'content' AS content,m.slug,
   COALESCE((SELECT jsonb_agg(x.external_id ORDER BY x.external_id) FROM product_external_ids x WHERE x.provider='ycp' AND x.account_id=$1 AND x.environment=$2 AND x.product_id=p.id),'[]'::jsonb) AS offer_ids,
   COALESCE((SELECT sum(GREATEST(0,LEAST(b.on_hand,asaya_stock_limit(p.id,w.id,$2='production'))-b.reserved)) FROM inventory_balances b JOIN warehouses w ON w.id=b.warehouse_id WHERE b.product_id=p.id AND w.active AND w.id=ANY($3::uuid[])),0) AS available,
   COALESCE((SELECT jsonb_agg(barcode ORDER BY barcode) FROM product_barcodes WHERE product_id=p.id),'[]'::jsonb) AS barcodes
   FROM products p JOIN product_prices pr ON pr.product_id=p.id AND pr.approved AND pr.currency='RUB'
   JOIN product_editor e ON e.product_id=p.id AND e.published IS NOT NULL
   JOIN LATERAL(SELECT slug FROM storefront_mappings WHERE product_id=p.id AND approved ORDER BY slug LIMIT 1) m ON true
   WHERE p.active AND p.sale_approved AND NOT EXISTS(SELECT 1 FROM product_components c WHERE c.product_id=p.id) ORDER BY p.sku`,[s.accountId,s.environment,(await ycpWarehouses(this.db.pool,s,true)).map(w=>w.warehouseId)]);
  const offers:string[]=[],skipped:Array<{sku:string;reason:string}>=[];
  const items:Array<{sku:string;offerId:string;available:number;regularMinor:number;finalMinor:number}>=[];
  for(const row of rows){
   const skip=(reason:string)=>skipped.push({sku:row.sku,reason});
   if(row.offer_ids.length!==1){skip(row.offer_ids.length?'AMBIGUOUS_OFFER_ID':'MISSING_OFFER_ID');continue;}
   const offerId=row.offer_ids[0] as string;
   if(!validOfferId.test(offerId)){skip('INVALID_OFFER_ID');continue;}
   if(!forCheckout&&Number(row.available)<1){skip('OUT_OF_STOCK');continue;}
   if(money(row.final_minor)===0){skip('PRICE_NOT_READY');continue;}
   const c=row.content,category=categories[c?.category];
   if(!category||typeof c?.description!=='string'||!xmlText(c.description).trim()||typeof row.name!=='string'||!xmlText(row.name).trim()||Array.from(row.name).length>150){skip('CONTENT_NOT_READY');continue;}
   const images=[...new Set([c.image,...(Array.isArray(c.gallery)?c.gallery:[])].filter((v):v is string=>typeof v==='string'&&Boolean(v)))].flatMap(path=>{
    try{const u=new URL(path,s.publicOrigin);if(u.protocol!=='https:'||u.username||u.password)return [];
     if(!/\.(jpe?g|png|webp)$/i.test(u.pathname)&&!/^\/api\/store\/v1\/media\/[a-f0-9-]{36}$/.test(u.pathname))return [];
     return [u.href];}catch{return [];}
   }).slice(0,10);
   if(!images.length){skip('IMAGE_NOT_READY');continue;}
   if(!row.weight_g||!row.width_mm||!row.height_mm||!row.depth_mm){skip('DIMENSIONS_NOT_READY');continue;}
   const url=new URL('/product/'+encodeURIComponent(row.slug)+'/',s.publicOrigin).href;
   if(url.length>512){skip('URL_TOO_LONG');continue;}
   const regular=money(row.regular_minor),final=money(row.final_minor),discount=regular?100*(regular-final)/regular:0;
   const old=regular%100===0&&discount>=5&&discount<=75?tag('oldprice',String(regular/100)):'';
   const barcodes=(row.barcodes as string[]).filter(b=>!b.startsWith('2')&&!b.startsWith('02'));
   items.push({sku:row.sku,offerId,available:Number(row.available),regularMinor:regular,finalMinor:final});
   offers.push(`<offer id="${xmlText(offerId)}" available="true">${tag('url',url)}${tag('price',rubles(final))}${old}${tag('currencyId','RUR')}${tag('categoryId',String(category.id))}${images.map(i=>tag('picture',i)).join('')}${tag('name',row.name)}${tag('vendor','ASAYA')}${tag('vendorCode',row.sku)}${tag('description',Array.from(c.description).slice(0,3000).join(''))}${barcodes.length?tag('barcode',barcodes.join(',')):''}${tag('weight',String(row.weight_g/1000))}${tag('dimensions',[row.depth_mm,row.width_mm,row.height_mm].map(n=>n/10).join('/'))}<param name="is_checkout_enabled">false</param></offer>`);
  }
  const xml=`<?xml version="1.0" encoding="UTF-8"?>\n<yml_catalog date="${this.clock().toISOString()}"><shop>${tag('name',s.feed.name)}${tag('company',s.feed.company)}${tag('url',s.publicOrigin)}<currencies><currency id="RUR" rate="1"/></currencies><categories>${Object.values(categories).map(c=>`<category id="${c.id}">${xmlText(c.name)}</category>`).join('')}</categories><offers>${offers.join('\n')}</offers></shop></yml_catalog>`;
  return {xml,included:offers.length,skipped,items};
 }
 async checkoutLink(raw:unknown,idempotencyKey:string=randomUUID()){
  z.uuid().parse(idempotencyKey);
  const s=this.settings;
  const body=z.object({items:z.array(z.object({sku:z.string().min(1).max(200),quantity:z.number().int().min(1).max(100)}).strict()).min(1).max(50)}).strict()
   .refine(v=>new Set(v.items.map(i=>i.sku)).size===v.items.length).parse(raw);
  body.items.sort((a,b)=>a.sku<b.sku?-1:a.sku>b.sku?1:0);
  const tests=(await this.db.pool.query('SELECT p.sku,t.quantity FROM product_test_stock t JOIN products p ON p.id=t.product_id WHERE t.enabled AND p.active AND p.archived_at IS NULL')).rows;
  if(!s.button?.enabled&&!body.items.every(i=>tests.some(t=>t.sku===i.sku&&t.quantity>=i.quantity)))throw new DomainError('YANDEX_CHECKOUT_UNAVAILABLE',503);
  // Custom-site button: canonical SKU, prices and stock. No feed metadata or mappings.
  const catalog=(await this.db.pool.query(`SELECT p.sku,pr.regular_minor,pr.final_minor,
   COALESCE((SELECT sum(GREATEST(0,LEAST(b.on_hand,asaya_stock_limit(p.id,w.id,$2))-b.reserved))
    FROM inventory_balances b JOIN warehouses w ON w.id=b.warehouse_id
    WHERE b.product_id=p.id AND w.active AND w.id=ANY($3::uuid[])),0) AS available
   FROM products p JOIN product_prices pr ON pr.product_id=p.id AND pr.approved AND pr.currency='RUB'
   JOIN product_editor e ON e.product_id=p.id AND e.published IS NOT NULL
   WHERE p.sku=ANY($1::text[]) AND p.active AND p.archived_at IS NULL AND p.sale_approved AND pr.final_minor>0
   AND NOT EXISTS(SELECT 1 FROM product_components c WHERE c.product_id=p.id)`,
   [body.items.map(i=>i.sku),s.environment==='production',(await ycpWarehouses(this.db.pool,s,true)).map(w=>w.warehouseId)])).rows;
  const items=body.items.map(line=>{
   const item=catalog.find(p=>p.sku===line.sku);
   if(!item||(item.available<1&&!tests.some(t=>t.sku===line.sku)))throw new DomainError('PRODUCT_UNAVAILABLE',409);
   if(line.quantity>(tests.find(t=>t.sku===line.sku)?.quantity??item.available))throw new DomainError('INSUFFICIENT_STOCK',409);
   // Official custom-site button amounts are rubles; identity is our stable canonical SKU.
   return {id:item.sku,quantity:line.quantity,price:money(item.regular_minor)/100,final_price:money(item.final_minor)/100};
  });
  const url=new URL('https://checkout.kit.yandex.ru/express');
  url.searchParams.set('host',new URL(s.publicOrigin).hostname);
  url.searchParams.set('data',Buffer.from(JSON.stringify({items}),'utf8').toString('base64'));
  // Persist before returning the redirect; a local attempt is not a YCP session or an order.
  return this.db.transaction(async tx=>{
   await lock(tx,canonical(['yandex-checkout-attempt',s.accountId,s.environment,idempotencyKey]));
   const prior=(await tx.query('SELECT * FROM yandex_checkout_attempts WHERE account_id=$1 AND environment=$2 AND idempotency_key=$3',[s.accountId,s.environment,idempotencyKey])).rows[0];
   const now=this.clock(),snapshot={items};
   if(prior){
    if(canonical(prior.request_snapshot)!==canonical(body)||canonical(prior.checkout_snapshot)!==canonical(snapshot)||prior.redirect_url!==url.href||new Date(prior.expires_at)<=now)throw new DomainError('CHECKOUT_ATTEMPT_CONFLICT',409);
    return {url:prior.redirect_url};
   }
   await tx.query('INSERT INTO yandex_checkout_attempts(id,account_id,environment,idempotency_key,request_snapshot,checkout_snapshot,redirect_url,created_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[randomUUID(),s.accountId,s.environment,idempotencyKey,JSON.stringify(body),JSON.stringify(snapshot),url.href,now,new Date(now.getTime()+3600000)]);
   return {url:url.href};
  });
 }
}
