export const defaultPdpOrder=['reviews','richContent','recommendations'] as const;
export type PdpBlock=typeof defaultPdpOrder[number];
export function isPdpOrder(raw:unknown):raw is PdpBlock[]{return Array.isArray(raw)&&raw.length===3&&new Set(raw).size===3&&raw.every(v=>defaultPdpOrder.includes(v));}
export function readPdpOrder(raw:unknown):PdpBlock[]{return isPdpOrder(raw)?[...raw]:[...defaultPdpOrder];}
