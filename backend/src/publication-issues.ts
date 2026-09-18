// Shared by Admin and the API: publication does not depend on logistics or stock.
export type PublicationDraft={name:string;regularMinor:number|null;finalMinor:number|null;content:{description:string;image:string;gallery?:string[];ingredients:string}};
export const publicationLabels:Record<string,string>={name:'Название товара',description:'Описание',ingredients:'Состав',image:'Минимум одна фотография',price:'Цена',price_order:'Цена продажи не должна превышать обычную цену'};
export function publicationIssues(d:PublicationDraft){
 const issues:string[]=[];
 for(const [key,value] of [['name',d.name],['description',d.content.description],['ingredients',d.content.ingredients]])if(!value?.trim())issues.push(key!);
 if(![d.content.image,...d.content.gallery??[]].some(v=>v?.trim()))issues.push('image');
 if(d.regularMinor===null&&d.finalMinor===null)issues.push('price');
 else if(d.regularMinor!==null&&d.finalMinor!==null&&d.finalMinor>d.regularMinor)issues.push('price_order');
 return issues;
}
