import {createStoreRequest,AuthClientError} from './auth-client.ts';
import {parseProductContent,type ProductContent} from './backend-catalog.ts';
export type StaffSession={user:{id:string;role:'admin'};csrfToken:string};
export type AdminDraft={sku:string;name:string;slug:string;content:ProductContent;regularMinor:number|null;finalMinor:number|null;weightG:number|null;widthMm:number|null;heightMm:number|null;depthMm:number|null};
export type ProductLifecycle='draft'|'published'|'unpublished'|'deleted';
export type AdminProduct={lifecycle?:ProductLifecycle;id:string;revision:number;active:boolean;hasDraft:boolean;publishedAt:string|null;draft:AdminDraft;stocks:Array<{warehouseId:string;name:string;active:boolean;onHand:number;reserved:number;source?:null|{kind:'cdek_ff_yml';generatedAt:string;fetchedAt:string;expiresAt:string;healthy:boolean;available:number;reportedQuantity:number}}>};
export type ProductRow={lifecycle?:ProductLifecycle;id:string;sku:string;name:string;active:boolean;revision:number;category:''|'hair'|'body'|'face'|'sets';image:string};
const emptyRowContent={description:'',volume:'',category:'hair',setKind:'none',usage:'',ingredients:'',aroma:'',features:[],image:'',gallery:[],badge:'',instruction:{steps:[],amount:'',tip:''},safety:'',recommendations:[],sensory:[]};
const idPattern=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const object=(r:unknown):Record<string,unknown>=>{if(!r||typeof r!=='object'||Array.isArray(r))throw new AuthClientError('INVALID_RESPONSE');return r as Record<string,unknown>;};
const uuid=(r:unknown):r is string=>typeof r==='string'&&idPattern.test(r);
const integer=(r:unknown):r is number=>typeof r==='number'&&Number.isSafeInteger(r)&&r>=0;
const messages:Record<string,string>={
 PRODUCT_ARCHIVED:'Товар удалён и не может быть опубликован.',
 PUBLISHED_REQUIRED_name:'У опубликованного товара обязательно название.',
 PUBLISHED_REQUIRED_description:'У опубликованного товара обязательно описание.',
 PUBLISHED_REQUIRED_ingredients:'У опубликованного товара обязателен состав.',
 PUBLISHED_REQUIRED_image:'У опубликованного товара должна остаться хотя бы одна фотография.',
 PUBLISHED_REQUIRED_price:'У опубликованного товара обязательна цена.',
 PUBLISHED_REQUIRED_price_order:'Цена продажи не должна превышать обычную цену.',
 MEDIA_REFERENCE_MISSING:'Одно из загруженных фото не найдено. Загрузите его заново.',
 STAFF_UNAVAILABLE:'Вход сотрудников ещё не настроен на сервере.',
 INVALID_STAFF_LOGIN:'Проверьте почту, пароль и код приложения. Использованный код повторно не принимается.',
 EDIT_CONFLICT:'Карточка уже изменена. Откройте её заново, чтобы не перезаписать чужие изменения.',
 SKU_IMMUTABLE:'Артикул нельзя изменить: товар опубликован либо уже связан с заказами или интеграциями. Для скрытого неиспользованного товара исправление доступно.',
 SKU_IN_USE:'Такой артикул уже используется.',
 SLUG_IN_USE:'Этот адрес карточки занят другим товаром.',
 SLUG_IMMUTABLE:'Адрес опубликованной карточки менять нельзя — на него могут вести ссылки.',
 PUBLISH_INCOMPLETE:'Для публикации заполните название, цену, состав, описание и минимум одну фотографию.',
 ASSEMBLED_SET_REQUIRED:'Для этого набора задан компонентный учёт. Его публикация пока недоступна.',
 STOCK_CONFLICT:'Остаток изменился. Обновите карточку перед корректировкой.',
 STOCK_RESERVED:'Новый остаток меньше количества в резерве.',
 STOCK_MANAGED_BY_PROVIDER:'Остаток поступает из СДЭК Фулфилмента и не редактируется вручную.',
 WAREHOUSE_UNAVAILABLE:'Склад недоступен.',
 FORBIDDEN:'Недостаточно прав.',
 PRODUCT_NOT_FOUND:'Товар не найден.'
};
export const adminError=(e:unknown)=>e instanceof AuthClientError?(messages[e.code]??e.message):'Не удалось выполнить действие. Обновите данные и проверьте результат.';
export function parseStaffSession(raw:unknown):StaffSession{
 const r=object(raw),u=object(r.user);
 if(!uuid(u.id)||u.role!=='admin'||typeof r.csrfToken!=='string'||!/^[a-f0-9]{64}$/.test(r.csrfToken))throw new AuthClientError('INVALID_RESPONSE');
 return {user:{id:u.id,role:'admin'},csrfToken:r.csrfToken};
}
export function parseAdminProduct(raw:unknown):AdminProduct{
 const r=object(raw),d=object(r.draft);
 if(!uuid(r.id)||!integer(r.revision)||typeof r.active!=='boolean'||typeof r.hasDraft!=='boolean'||
  !(r.publishedAt===null||typeof r.publishedAt==='string'&&Number.isFinite(Date.parse(r.publishedAt)))||
  !['sku','name','slug'].every(k=>typeof d[k]==='string')||
  !['regularMinor','finalMinor','weightG','widthMm','heightMm','depthMm'].every(k=>d[k]===null||integer(d[k]))||!Array.isArray(r.stocks))throw new AuthClientError('INVALID_RESPONSE');
 const stocks=r.stocks.map(rawStock=>{const s=object(rawStock);if(!uuid(s.warehouseId)||typeof s.name!=='string'||typeof s.active!=='boolean'||!integer(s.onHand)||!integer(s.reserved)||s.reserved>s.onHand)throw new AuthClientError('INVALID_RESPONSE');
  if(s.source!=null){const source=object(s.source);if(source.kind!=='cdek_ff_yml'||typeof source.healthy!=='boolean'||!integer(source.available)||!integer(source.reportedQuantity)||!['generatedAt','fetchedAt','expiresAt'].every(k=>typeof source[k]==='string'&&Number.isFinite(Date.parse(source[k] as string))))throw new AuthClientError('INVALID_RESPONSE');}
  return s as AdminProduct['stocks'][number];});
 if(r.lifecycle!==undefined&&!['draft','published','unpublished','deleted'].includes(String(r.lifecycle)))throw new AuthClientError('INVALID_RESPONSE');
 return {id:r.id,revision:r.revision,lifecycle:r.lifecycle as ProductLifecycle|undefined,active:r.active,hasDraft:r.hasDraft,publishedAt:r.publishedAt as string|null,draft:{...d,content:parseProductContent(d.content)} as AdminDraft,stocks};
}
export function createAdminClient(base:string,fetcher:typeof fetch=fetch){
 const request=createStoreRequest(base,fetcher);
 const changed=(raw:unknown,id:string,revision:number)=>{const r=object(raw);if(r.id!==id||r.revision!==revision+1)throw new AuthClientError('INVALID_RESPONSE');};
 const ok=(raw:unknown)=>{if(object(raw).ok!==true)throw new AuthClientError('INVALID_RESPONSE');};
 const path=(id:string)=>{if(!uuid(id))throw new AuthClientError('INVALID_INPUT');return 'products/'+id;};
 return {
  async me(){try{return parseStaffSession(await request('auth/me','GET'));}catch(e){if(e instanceof AuthClientError&&e.code==='UNAUTHENTICATED')return null;throw e;}},
  async login(email:string,password:string,code:string){return parseStaffSession(await request('auth/login','POST',{email:email.trim().toLowerCase(),password,code}));},
  async logout(csrf:string){try{ok(await request('auth/logout','POST',{},csrf));}catch(e){if(e instanceof AuthClientError&&e.code==='UNAUTHENTICATED')return;throw e;}},
  async list(search='',offset=0,category=''){
   const r=object(await request('products?search='+encodeURIComponent(search)+'&offset='+offset+'&category='+encodeURIComponent(category),'GET'));
   if(!Array.isArray(r.items)||r.items.length>50||!(r.nextOffset===null||integer(r.nextOffset)&&r.nextOffset>offset))throw new AuthClientError('INVALID_RESPONSE');
   const items=r.items.map(rawItem=>{const v=object(rawItem);if(!uuid(v.id)||typeof v.sku!=='string'||typeof v.name!=='string'||typeof v.active!=='boolean'||!integer(v.revision))throw new AuthClientError('INVALID_RESPONSE');const category=v.category??'',image=v.image??'';if(typeof category!=='string'||!['','hair','body','face','sets'].includes(category)||typeof image!=='string')throw new AuthClientError('INVALID_RESPONSE');parseProductContent({...emptyRowContent,image});return {...v,category,image} as ProductRow;});
   return {items,nextOffset:r.nextOffset as number|null};
  },
  async detail(id:string){const d=parseAdminProduct(await request(path(id),'GET'));if(d.id!==id)throw new AuthClientError('INVALID_RESPONSE');return d;},
  async save(id:string,draft:AdminDraft,revision:number,csrf:string){changed(await request(path(id),'PUT',{...draft,revision},csrf),id,revision);},
  async publish(id:string,revision:number,csrf:string){changed(await request(path(id)+'/publish','POST',{revision},csrf),id,revision);},
  async unpublish(id:string,revision:number,csrf:string){ok(await request(path(id)+'/unpublish','POST',{revision},csrf));},
  async remove(id:string,revision:number,sku:string,csrf:string){const r=object(await request(path(id)+'/remove','POST',{revision,sku,confirmed:true},csrf));if(r.outcome!=='archived'&&r.outcome!=='deleted')throw new AuthClientError('INVALID_RESPONSE');return r.outcome;},
  async stock(id:string,stock:{warehouseId:string;expectedOnHand:number;onHand:number},csrf:string){ok(await request(path(id)+'/stock','POST',stock,csrf));},
  async history(id:string){
   const r=object(await request(path(id)+'/history','GET'));
   if(!Array.isArray(r.items)||r.items.length>50)throw new AuthClientError('INVALID_RESPONSE');
   return r.items.map(raw=>{const v=object(raw);if(typeof v.action!=='string'||typeof v.created_at!=='string'||!uuid(v.actor_id))throw new AuthClientError('INVALID_RESPONSE');return {action:v.action,createdAt:v.created_at,actorId:v.actor_id};});
  }
 };
}
