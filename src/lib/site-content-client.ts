import {AuthClientError,createStoreRequest} from './auth-client.ts';
import {parseSitePage,sitePages,type SitePage,type SitePageId} from '../../backend/src/site-content-format.ts';
export {parseSitePage,blockTemplates,sitePages,sitePublicationIssues,isSiteImage,isSiteLink,isSharedPage,allowedBlockTypes} from '../../backend/src/site-content-format.ts';
export type {SitePage,SitePageId,SiteBlock,SiteField,BlockType} from '../../backend/src/site-content-format.ts';
export {sitePageDefaults} from '../../backend/src/site-content-defaults.ts';
export type SiteDraft={id:SitePageId;revision:number;draft:SitePage;publishedAt:string|null};
const object=(raw:unknown):Record<string,unknown>=>{if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new AuthClientError('INVALID_RESPONSE');return raw as Record<string,unknown>;};
export function parseSiteDraft(raw:unknown):SiteDraft{
 const r=object(raw);let draft:SitePage;
 try{draft=parseSitePage(r.draft);}catch{throw new AuthClientError('INVALID_RESPONSE');}
 if(r.id!==draft.id||!Number.isSafeInteger(r.revision)||Number(r.revision)<0||!(r.publishedAt===null||typeof r.publishedAt==='string'&&Number.isFinite(Date.parse(r.publishedAt))))throw new AuthClientError('INVALID_RESPONSE');
 return {id:draft.id,revision:r.revision as number,draft,publishedAt:r.publishedAt as string|null};
}
export function createSiteClient(base:string,fetcher:typeof fetch=fetch){
 const request=createStoreRequest(base,fetcher);
 const path=(id:SitePageId)=>{if(!sitePages.some(p=>p.id===id))throw new AuthClientError('INVALID_INPUT');return 'site-pages/'+id;};
 const changed=(raw:unknown,id:SitePageId,revision:number)=>{const r=object(raw);if(r.id!==id||r.revision!==revision+1)throw new AuthClientError('INVALID_RESPONSE');};
 return {
  async get(id:SitePageId){const r=parseSiteDraft(await request(path(id),'GET'));if(r.id!==id)throw new AuthClientError('INVALID_RESPONSE');return r;},
  async save(id:SitePageId,page:SitePage,revision:number,csrf:string){parseSitePage(page);changed(await request(path(id),'PUT',{page,revision},csrf),id,revision);},
  async publish(id:SitePageId,revision:number,csrf:string){changed(await request(path(id)+'/publish','POST',{revision},csrf),id,revision);},
  async restore(id:SitePageId,revision:number,csrf:string){changed(await request(path(id)+'/restore','POST',{revision},csrf),id,revision);}
 };
}
export const siteError=(error:unknown)=>error instanceof AuthClientError?({EDIT_CONFLICT:'Эту страницу уже изменил другой сотрудник. Ваши правки остаются на экране. Скопируйте их и загрузите последнюю версию перед сохранением.',PAGE_INCOMPLETE:'Заполните обязательные поля видимых блоков перед публикацией.',INVALID_SITE_CONTENT:'Проверьте содержимое блоков и ссылки.',MEDIA_REFERENCE_MISSING:'Одно из загруженных изображений не найдено. Загрузите его снова.'}[error.code]??error.message):'Не удалось выполнить действие. Ваши правки остаются на экране.';
