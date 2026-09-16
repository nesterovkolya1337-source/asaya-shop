// Shared, dependency-free normalization for customer SMS sign-in.
export function normalizeCustomerPhone(raw:string):string|null {
 const value=raw.trim();
 if(value.length>32||!/^\+?[0-9 ()-]+$/.test(value))return null;
 const digits=value.replace(/\D/g,'');
 if(value.startsWith('+'))return /^7\d{10}$/.test(digits)?'+'+digits:null;
 if(/^\d{10}$/.test(digits))return '+7'+digits;
 if(/^[78]\d{10}$/.test(digits))return '+7'+digits.slice(1);
 return null;
}
