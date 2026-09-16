import Image,{type ImageProps} from 'next/image';
import type {CSSProperties} from 'react';
import {parseImageCrop,type ResponsiveImageCrop} from '../../backend/src/image-crop';
import styles from './cropped-image.module.css';
export function cropStyle(crop:ResponsiveImageCrop):CSSProperties{
 const mobile=crop.mobile??crop.desktop;
 return {'--crop-x':crop.desktop.x+'%','--crop-y':crop.desktop.y+'%','--crop-zoom':crop.desktop.zoom,'--crop-mobile-x':mobile.x+'%','--crop-mobile-y':mobile.y+'%','--crop-mobile-zoom':mobile.zoom} as CSSProperties;
}
export function CroppedImage({crop,defaultCrop,className='',...props}:ImageProps&{crop?:string;defaultCrop?:ResponsiveImageCrop}){
 const settings=parseImageCrop(crop)??defaultCrop;
 return <Image {...props} data-site-image className={`${className} ${settings?styles.cropped:''}`} style={{...props.style,...(settings?cropStyle(settings):{})}}/>;
}
