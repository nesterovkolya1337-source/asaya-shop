export type StorefrontBanner={enabled:boolean;message:string;buttonText:string;buttonUrl:string;revision?:number};
export function safeBannerLink(value:string){try{if(value.startsWith('/')&&!value.startsWith('//')&&!/[\s\\]/.test(value))return true;const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}}
export function visibleBanner(raw:unknown):StorefrontBanner|null{
 if(!raw||typeof raw!=='object')return null;const v=raw as StorefrontBanner;
 if(v.enabled!==true||typeof v.message!=='string'||!v.message.trim())return null;
 return {...v,buttonText:typeof v.buttonText==='string'?v.buttonText:'',buttonUrl:typeof v.buttonUrl==='string'&&safeBannerLink(v.buttonUrl)?v.buttonUrl:''};
}
