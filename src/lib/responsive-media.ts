import packshotVariants from './packshot-image-variants.json' with {type:'json'};
import richVariants from './rich-image-variants.json' with {type:'json'};
import {parseImageCrop,type ResponsiveImageCrop} from '../../backend/src/image-crop.ts';
export const mediaWidths=[640,960,1280,1600,2400,3200] as const;
export function responsiveMedia(src:string,sizes:string,crop?:string,defaultCrop?:ResponsiveImageCrop){
 const imageStart=src.indexOf('/images/figma/');
 const richKey=imageStart>=0?src.slice(imageStart):src;
 const variants=({...richVariants,...packshotVariants} as Record<string,Array<{width:number;src:string}>>)[richKey];
 if(variants){const prefix=src.slice(0,src.length-richKey.length);return {src:prefix+variants[0].src,srcSet:variants.map(v=>`${prefix}${v.src} ${v.width}w`).join(', '),sizes};}
 if(!/^\/(?:[^/?#]+\/)*api\/store\/v1\/media\/[a-f0-9-]{36}$/.test(src))return null;
 const settings=parseImageCrop(crop)??defaultCrop;
 const suffix=settings?'&crop='+encodeURIComponent(JSON.stringify(settings)):'';
 return {src:src+'?w=640'+suffix,srcSet:mediaWidths.map(w=>`${src}?w=${w}${suffix} ${w}w`).join(', '),sizes};
}
