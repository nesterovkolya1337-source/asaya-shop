import {AuthClientError,createStoreRequest} from './auth-client.ts';
export const MAX_IMAGE_BYTES=20*1024*1024;
export type UploadedImage={id:string;url:string;width:number;height:number;bytes:number;mime:'image/webp'};
export function validateImageFile(file:Pick<File,'size'|'type'>){
 if(!file.size||file.size>MAX_IMAGE_BYTES)throw new AuthClientError('IMAGE_TOO_LARGE');
 if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new AuthClientError('UNSUPPORTED_IMAGE');
}
export async function imageData(file:File){
 validateImageFile(file);const bytes=new Uint8Array(await file.arrayBuffer());let binary='';
 for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
 return btoa(binary);
}
export function createMediaClient(base:string,fetcher:typeof fetch=fetch){
 const request=createStoreRequest(base,fetcher);
 return {async upload(id:string,file:File,csrf:string):Promise<UploadedImage>{
  if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id))throw new AuthClientError('INVALID_INPUT');
  const raw=await request('media','POST',{id,data:await imageData(file)},csrf,undefined,120000);
  if(!raw||typeof raw!=='object')throw new AuthClientError('INVALID_RESPONSE');
  const r=raw as UploadedImage;
  if(r.id!==id||r.url!=='/api/store/v1/media/'+id||r.mime!=='image/webp'||
   ![r.width,r.height].every(v=>Number.isInteger(v)&&v>=1&&v<=2048)||!Number.isInteger(r.bytes)||r.bytes<1||r.bytes>MAX_IMAGE_BYTES)throw new AuthClientError('INVALID_RESPONSE');
  return {id:r.id,url:r.url,width:r.width,height:r.height,bytes:r.bytes,mime:r.mime};
 }};
}
const messages:Record<string,string>={
 IMAGE_TOO_LARGE:'Выберите непустой файл размером до 20 МБ.',
 UNSUPPORTED_IMAGE:'Подходят фотографии JPG, PNG и WebP.',
 INVALID_IMAGE:'Изображение повреждено, содержит анимацию или превышает 25 мегапикселей. Выберите другое фото.',
 MEDIA_BUSY:'Сейчас обрабатываются другие фотографии. Повторите загрузку чуть позже.',
 MEDIA_CONFLICT:'Этот файл не удалось повторно загрузить. Выберите его заново.',
 MEDIA_REFERENCE_MISSING:'Одно из загруженных фото не найдено. Загрузите его заново.'
};
export function mediaError(error:unknown){return error instanceof AuthClientError?messages[error.code]??error.message:'Не удалось прочитать файл. Выберите его заново.';}
