import Image,{type ImageProps} from 'next/image';
import type {CSSProperties} from 'react';
import {parseImageCrop,type ResponsiveImageCrop} from '../../backend/src/image-crop';
import styles from './cropped-image.module.css';
import {responsiveMedia} from '../lib/responsive-media';
export function cropStyle(crop:ResponsiveImageCrop):CSSProperties{
 const mobile=crop.mobile??crop.desktop;
 return {'--crop-x':crop.desktop.x+'%','--crop-y':crop.desktop.y+'%','--crop-zoom':crop.desktop.zoom,'--crop-mobile-x':mobile.x+'%','--crop-mobile-y':mobile.y+'%','--crop-mobile-zoom':mobile.zoom} as CSSProperties;
}
export function CroppedImage({crop,defaultCrop,cropPreview=false,className='',...props}:ImageProps&{crop?:string;defaultCrop?:ResponsiveImageCrop;cropPreview?:boolean}){
 const settings=parseImageCrop(crop)??defaultCrop;
 const responsive=typeof props.src==='string'?(cropPreview?responsiveMedia(props.src,'3200px'):responsiveMedia(props.src,props.sizes??(props.width?`${props.width}px`:'100vw'),crop,defaultCrop)):null;
 if(responsive){
  const {fill,priority,preload,unoptimized,loader,quality,placeholder,blurDataURL,overrideSrc,onLoadingComplete,src,...imageProps}=props;
  // Managed media already has server-side derivatives. Avoid a second Next encoder.
  // Keep existing CSS crop semantics; query metadata rebuilds directly from master.
  return <img {...imageProps} {...responsive} alt={props.alt} data-site-image decoding={props.decoding??'async'} loading={props.loading??(priority||preload?'eager':'lazy')} fetchPriority={priority||preload?'high':props.fetchPriority}
   className={`${className} ${settings?styles.cropped:''}`} style={{...(fill?{position:'absolute',inset:0,width:'100%',height:'100%'} as CSSProperties:{}),...props.style,...(settings?cropStyle(settings):{})}}/>;
 }
 return <Image {...props} data-site-image className={`${className} ${settings?styles.cropped:''}`} style={{...props.style,...(settings?cropStyle(settings):{})}}/>;
}
