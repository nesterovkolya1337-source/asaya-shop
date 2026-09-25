import {canonical} from './core.js';
import {parsePdpContent,type PdpContent,type PdpSection} from './pdp-content.js';

export type HowToCorrection={sku:string;node:PdpContent['node'];expected:PdpSection;replacement:PdpSection};
const comparable=(section:PdpSection)=>{const {visible,...rest}=section;return canonical(rest);};

/** Correct only a known existing section. Never enable content or replace manager edits. */
export function correctHowTo(content:PdpContent|undefined,patch:HowToCorrection){
 if(!content?.enabled)return {status:'not_published_content' as const,content};
 const section=content.sections.find(s=>s.kind==='howTo');
 if(!section)return {status:'missing_section' as const,content};
 if(comparable(section)===comparable(patch.replacement))return {status:'already_corrected' as const,content};
 if(comparable(section)!==comparable(patch.expected))return {status:'content_conflict' as const,content};
 const replacement={...patch.replacement,...(section.visible===undefined?{}:{visible:section.visible})};
 return {status:'ready' as const,content:parsePdpContent({...content,node:patch.node,sections:content.sections.map(s=>s===section?replacement:s)})};
}
