import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
export class DomainError extends Error {
 constructor(readonly code: string, readonly status = 409) { super(code); }
}
export function canonical(value: unknown): string {
 if(Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
 if(value!==null && typeof value==='object') return `{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
 return JSON.stringify(value);
}
export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export const mac = (secret: string, value: string) => createHmac('sha256',secret).update(value).digest('hex');
export function equal(a: string,b: string) {
 const x = Buffer.from(a); const y=Buffer.from(b);
 return x.length===y.length && timingSafeEqual(x,y);
}
export function money(value: unknown): number {
 const n=Number(value);
 if(!Number.isSafeInteger(n)||n<0||n>1_000_000_000_000) throw new DomainError('INVALID_AMOUNT',400);
 return n;
}
