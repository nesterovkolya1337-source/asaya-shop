export type PublicationDraft={name:string;slug:string;regularMinor:number|null;finalMinor:number|null;content:{description:string;volume:string;image:string;usage:string;ingredients:string;category:string;setKind:string}};
export function publicationIssues(d:PublicationDraft){
 const issues:string[]=[];
 for(const [key,value] of [['name',d.name],['slug',d.slug],['description',d.content.description],['volume',d.content.volume],['image',d.content.image],['usage',d.content.usage],['ingredients',d.content.ingredients]])if(!value)issues.push(key!);
 if(d.regularMinor===null||d.finalMinor===null)issues.push('price');
 else if(d.finalMinor>d.regularMinor)issues.push('price_order');
 if((d.content.category==='sets')!==(d.content.setKind!=='none'))issues.push('set_kind');
 return issues;
}
