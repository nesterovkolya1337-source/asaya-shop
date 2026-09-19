import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {parseImageCrop} from './image-crop.js';
export const IMAGE_WIDTHS=[640,960,1280,1600,2400,3200] as const;
export const imageHash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
export function variantSettings(width:number,crop?:string){
 if(!IMAGE_WIDTHS.includes(width as typeof IMAGE_WIDTHS[number]))throw Error('INVALID_IMAGE_VARIANT');
 const settings=parseImageCrop(crop);
 // Cropping stays in CSS: a layout's actual aspect ratio is not known to the API.
 // Rebuild from the master with enough pixels for zoom; never crop twice.
 const zoom=settings?Math.max(settings.desktop.zoom,settings.mobile?.zoom??1):1;
 const normalized=settings?JSON.stringify(settings):'';
 return {width,zoom,key:`v1:${width}:${imageHash(Buffer.from(normalized))}`};
}
export async function renderDerivative(master:Buffer,width:number,hasAlpha:boolean,zoom=1,bounded=false){
 const {data,info}=await sharp(master,{failOn:'warning',limitInputPixels:25_000_000,animated:false}).rotate()
  .resize({width:Math.round(width*zoom),...(bounded?{height:width,fit:'inside' as const}:{}),withoutEnlargement:true})
  .webp({quality:94,alphaQuality:100,lossless:hasAlpha,effort:4}).timeout({seconds:20}).toBuffer({resolveWithObject:true});
 return {content:data,width:info.width,height:info.height,contentHash:imageHash(data)};
}
