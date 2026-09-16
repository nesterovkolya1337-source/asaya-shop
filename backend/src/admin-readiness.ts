import {z} from 'zod';
import {Database} from './db.js';
import {DomainError} from './core.js';
import {draftSchema,emptyContent} from './admin-catalog.js';
import {publicationIssues} from './publication-issues.js';
export class AdminReadiness{
 constructor(private db:Database,private catalogOnly:boolean,private ycpConfigured:boolean){}
 async get(actor:string,raw:unknown){
  if(!(await this.db.pool.query("SELECT 1 FROM users WHERE id=$1 AND role='admin' AND NOT disabled",[actor])).rowCount)throw new DomainError('FORBIDDEN',403);
  const {offset}=z.object({offset:z.coerce.number().int().min(0).max(1000000).default(0)}).strict().parse(raw);
  const r=(await this.db.pool.query(`WITH page AS (
   SELECT p.id,p.sku,p.name,p.active,p.weight_g,p.width_mm,p.height_mm,p.depth_mm,e.draft,e.published,
    pr.regular_minor,pr.final_minor,
    (SELECT slug FROM storefront_mappings WHERE product_id=p.id ORDER BY approved DESC,slug LIMIT 1) AS slug,
    EXISTS(SELECT 1 FROM product_components WHERE product_id=p.id) AS components,
    EXISTS(SELECT 1 FROM inventory_balances b JOIN warehouses w ON w.id=b.warehouse_id WHERE b.product_id=p.id AND w.active AND b.on_hand>b.reserved) AS stock,
    EXISTS(SELECT 1 FROM storefront_mappings m WHERE m.slug=e.draft->>'slug' AND m.product_id<>p.id) AS slug_taken,
    EXISTS(SELECT 1 FROM jsonb_array_elements_text(COALESCE(e.draft->'content'->'gallery','[]'::jsonb)||jsonb_build_array(e.draft->'content'->>'image')) a(url)
      WHERE a.url LIKE '/api/store/v1/media/%' AND NOT EXISTS(SELECT 1 FROM product_media pm WHERE '/api/store/v1/media/'||pm.id::text=a.url)) AS missing_media
   FROM products p LEFT JOIN product_editor e ON e.product_id=p.id LEFT JOIN product_prices pr ON pr.product_id=p.id
   ORDER BY p.sku,p.id LIMIT 50 OFFSET $1)
   SELECT (SELECT count(*)::int FROM products) AS total,
    (SELECT count(*)::int FROM products WHERE active) AS published_count,
    (SELECT count(*)::int FROM warehouses WHERE active) AS warehouses,
    COALESCE(jsonb_agg(to_jsonb(page) ORDER BY page.sku,page.id),'[]'::jsonb) AS items FROM page`,[offset])).rows[0];
  const items=r.items.map((p:Record<string,any>)=>{
   const parsed=draftSchema.safeParse({...p.draft??{sku:p.sku,name:p.name,slug:p.slug??'',content:emptyContent,regularMinor:p.regular_minor===null?null:Number(p.regular_minor),finalMinor:p.final_minor===null?null:Number(p.final_minor),weightG:p.weight_g,widthMm:p.width_mm,heightMm:p.height_mm,depthMm:p.depth_mm},revision:0});
   const issues=parsed.success?publicationIssues(parsed.data):['card_data'];
   if(p.components)issues.push('components');
   if(p.slug_taken)issues.push('slug_taken');
   if(parsed.success&&p.published&&p.published.slug!==parsed.data.slug)issues.push('slug_changed');
   if(p.missing_media)issues.push('missing_media');
   const deliveryIssues:string[]=[];
   if(!parsed.success||![parsed.data.weightG,parsed.data.widthMm,parsed.data.heightMm,parsed.data.depthMm].every(v=>v!==null&&v>0))deliveryIssues.push('dimensions');
   if(!p.stock)deliveryIssues.push('stock');
   return {id:p.id,sku:p.sku,name:parsed.success?parsed.data.name:p.name,published:p.active,publicationIssues:issues,deliveryIssues};
  });
  return {total:r.total,publishedCount:r.published_count,warehouseCount:r.warehouses,catalogOnly:this.catalogOnly,ycpConfigured:this.ycpConfigured,items,nextOffset:offset+items.length<r.total?offset+items.length:null};
 }
}
