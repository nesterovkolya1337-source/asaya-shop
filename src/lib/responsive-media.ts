import {parseImageCrop,type ResponsiveImageCrop} from '../../backend/src/image-crop.ts';
export const mediaWidths=[640,960,1280,1600,2400,3200] as const;
export function responsiveMedia(src:string,sizes:string,crop?:string,defaultCrop?:ResponsiveImageCrop){
 if(!/^\/(?:[^/?#]+\/)*api\/store\/v1\/media\/[a-f0-9-]{36}$/.test(src))return null;
 const settings=parseImageCrop(crop)??defaultCrop;
 const suffix=settings?'&crop='+encodeURIComponent(JSON.stringify(settings)):'';
 return {src:src+'?w=640'+suffix,srcSet:mediaWidths.map(w=>`${src}?w=${w}${suffix} ${w}w`).join(', '),sizes};
}
