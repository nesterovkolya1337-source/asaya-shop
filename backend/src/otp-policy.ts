import {z} from 'zod';
const schema=z.object({
 ttlSeconds:z.number().int().min(60).max(900).default(300),
 maxAttempts:z.number().int().min(1).max(5).default(5),
 resendSeconds:z.number().int().min(60).max(600).default(60),
 sendPerIpPerHour:z.number().int().min(1).max(100).default(100),
 sendPerPhonePerHour:z.number().int().min(1).max(20).default(5),
 sendPerPhonePerDay:z.number().int().min(1).max(20).default(10),
 verifyPerIpPerFiveMinutes:z.number().int().min(1).max(100).default(100),
}).strict();
export type OtpPolicy=z.infer<typeof schema>;
export function otpPolicy(raw:unknown={}):OtpPolicy{return schema.parse(raw);}
export function otpPolicyFromEnv(env:NodeJS.ProcessEnv):OtpPolicy {
 const keys={ttlSeconds:'OTP_TTL_SECONDS',maxAttempts:'OTP_MAX_ATTEMPTS',resendSeconds:'OTP_RESEND_SECONDS',sendPerIpPerHour:'OTP_SEND_PER_IP_PER_HOUR',sendPerPhonePerHour:'OTP_SEND_PER_PHONE_PER_HOUR',sendPerPhonePerDay:'OTP_SEND_PER_PHONE_PER_DAY',verifyPerIpPerFiveMinutes:'OTP_VERIFY_PER_IP_PER_FIVE_MINUTES'};
 const raw:Record<string,number>={};
 for(const [key,name] of Object.entries(keys))if(env[name]!==undefined){
  if(!/^\d+$/.test(env[name]!))throw new Error('Invalid OTP limit: '+name);
  raw[key]=Number(env[name]);
 }
 return otpPolicy(raw);
}
