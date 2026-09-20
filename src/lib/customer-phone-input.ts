// Presentation only; the server remains responsible for phone validation.
export function phoneDigits(value:string):string {
 const digits=value.replace(/\D/g,'');
 return (value.trim().startsWith('+7')||(digits.length>10&&/^[78]/.test(digits))?digits.slice(1):digits).slice(0,10);
}
export function formatPhoneDigits(digits:string):string {
 return [digits.slice(0,3),digits.slice(3,6),digits.slice(6,8),digits.slice(8,10)]
  .filter(Boolean).reduce((text,part,index)=>text+(index===1?' ':index>1?'-':'')+part,'');
}
export function displayPhone(value:string):string {
 return '+7 '+formatPhoneDigits(phoneDigits(value));
}
