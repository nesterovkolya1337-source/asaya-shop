// Non-destructive image settings. Source files are never rewritten.
export type ImageCrop={x:number;y:number;zoom:number};
export type ResponsiveImageCrop={desktop:ImageCrop;mobile?:ImageCrop};
export const centeredCrop:ImageCrop={x:50,y:50,zoom:1};
function crop(raw:unknown):ImageCrop{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('INVALID_SITE_CONTENT');
 const r=raw as Record<string,unknown>;
 if(Object.keys(r).sort().join(',')!=='x,y,zoom')throw Error('INVALID_SITE_CONTENT');
 for(const key of ['x','y','zoom'])if(typeof r[key]!=='number'||!Number.isFinite(r[key]))throw Error('INVALID_SITE_CONTENT');
 if(Number(r.x)<0||Number(r.x)>100||Number(r.y)<0||Number(r.y)>100||Number(r.zoom)<1||Number(r.zoom)>5)throw Error('INVALID_SITE_CONTENT');
 return {x:Number(r.x),y:Number(r.y),zoom:Number(r.zoom)};
}
export function parseImageCrop(value:string|undefined):ResponsiveImageCrop|null{
 if(!value)return null;
 if(typeof value!=='string'||value.length>500)throw Error('INVALID_SITE_CONTENT');
 let data:unknown;try{data=JSON.parse(value);}catch{throw Error('INVALID_SITE_CONTENT');}
 if(!data||typeof data!=='object'||Array.isArray(data))throw Error('INVALID_SITE_CONTENT');
 const r=data as Record<string,unknown>;
 if(Object.keys(r).some(k=>!['desktop','mobile'].includes(k)))throw Error('INVALID_SITE_CONTENT');
 return {desktop:crop(r.desktop),...(r.mobile===undefined?{}:{mobile:crop(r.mobile)})};
}
export function defaultImageCrop(type:string,source:string):ResponsiveImageCrop{
 const file=source.split('/').at(-1);
 let desktop={...centeredCrop},mobile={...centeredCrop};
 if(type==='homeHero'&&file==='hero.webp'){desktop.y=24.6235;mobile={x:55,y:0,zoom:1};}
 if(type==='manifesto'&&file==='asaya-6139.webp'){desktop={x:52.5841,y:55.4787,zoom:1.28456};mobile={x:50,y:41,zoom:1};}
 if(type==='categories'){
  const presets:Record<string,ImageCrop>={
   'asaya-6205.webp':{x:64.31/1.176,y:39.98/2.2573,zoom:2.176},
   'asaya-6691.webp':{x:35.02/.8017,y:8.43/1.7012,zoom:1.8017},
   'asaya-6629.webp':{x:157.88/3.0386,y:146.62/5.0578,zoom:4.0386},
  };desktop=presets[file??'']??desktop;mobile={...desktop};
 }
 if(type==='gallery'){
  const presets:Record<string,ImageCrop>={
   'ugc-img5872.webp':{x:27.05/.4895,y:57.21/.986,zoom:1.4895},
   'ugc-000012160039.webp':{x:43.2/.864,y:4.9/.2357,zoom:1.2357},
   'ugc-img3456.webp':{x:3.07/.121,y:21.23/.4946,zoom:1.121},
  };desktop=presets[file??'']??desktop;mobile={...desktop};
 }
 if(type==='aboutHero'){desktop={x:50,y:44,zoom:1};mobile={...desktop};}
 return {desktop,mobile};
}
export function cropReferenceRatio(type:string,mobile=false){
 if(type==='homeHero')return mobile?370/690:1159/594.9448;
 if(type==='manifesto')return mobile?370/360:1160/550;
 if(type==='aboutHero'||type==='story')return 570/750;
 return 1;
}
