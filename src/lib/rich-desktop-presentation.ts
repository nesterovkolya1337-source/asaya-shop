import approved from './figma-desktop-copy.json' with {type:'json'};
import type {PdpSection} from '../../backend/src/pdp-content';

/** Segment existing prose only; never substitute Figma marketing claims. */
export function ingredientSegments(section:PdpSection):Array<{title:string;body:string}>|null{
 if(section.kind!=='ingredients'||section.items.length||!section.body.trim())return null;
 const names=section.title.split(/,\s*|\s+и\s+/u).map(x=>x.trim()).filter(Boolean);
 if(names.length<2)return null;
 const body=section.body,lower=body.toLocaleLowerCase('ru');
 const starts=names.map(title=>({title,index:lower.indexOf(title.toLocaleLowerCase('ru'))})).sort((a,b)=>a.index-b.index);
 if(starts.some(x=>x.index<0)||starts[0].index!==0)return null;
 return starts.map((x,i)=>({title:x.title,body:body.slice(x.index+x.title.length,starts[i+1]?.index??body.length).trim().replace(/,\s*(?:а\s*)?$/u,'')}));
}

export function desktopSection(section:PdpSection,sku:string):PdpSection{
 const patch=(approved as Record<string,{expectedBody:string;items:Array<{title:string;body:string}>}>)[sku];
 // Apply only to the reviewed legacy copy; later Admin edits must remain authoritative.
 if(section.kind!=='ingredients'||!patch||section.body!==patch.expectedBody)return section;
 return {...section,title:'',body:'',additionalBody:'',items:patch.items};
}
