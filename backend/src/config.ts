import { z } from 'zod';
import {otpPolicyFromEnv} from './otp-policy.js';
import {smsAeroFromEnv} from './smsaero.js';
import {cdekTrackingFromEnv} from './cdek-delivery.js';
export function config(env: NodeJS.ProcessEnv = process.env) {
 const c=z.object({
  DATABASE_URL:z.string().url(), OTP_SECRET:z.string().min(32),
  STAFF_SECRET:z.string().min(32).optional(),
  CDEK_STOCK_SETTINGS_FILE:z.string().min(1).optional(),
  YANDEX_ID_CLIENT_ID:z.string().regex(/^[a-f0-9]{32}$/i).optional(),
  YCP_TOKEN:z.string().min(32).max(4096).optional(),YCP_SETTINGS_FILE:z.string().min(1).optional(),
  FULFILLMENT_ENABLED:z.enum(['false','true']).default('false'),
  UNPAID_RETENTION_ENABLED:z.enum(['false','true']).default('false'),
  FULFILLMENT_SETTINGS_FILE:z.string().min(1).optional(),
  FULFILLMENT_LOGIN:z.string().min(1).max(254).optional(),FULFILLMENT_PASSWORD:z.string().min(1).max(512).optional(),
  DEPLOYMENT_MODE:z.enum(['foundation','catalog','ycp']).default('foundation'),
  NODE_ENV:z.enum(['development','test','production']).default('development'),
  HOST:z.string().default('127.0.0.1'), PORT:z.coerce.number().int().min(1).max(65535).default(3100),
  PUBLIC_ORIGIN:z.string().url().default('http://localhost:3100'),
  COOKIE_SECURE:z.enum(['true','false']).default('true'),
  RESERVATION_SWEEP_INTERVAL_MS:z.coerce.number().int().min(1000).max(300000).default(60000)
 }).parse(env);
 if(Boolean(c.YCP_TOKEN)!==Boolean(c.YCP_SETTINGS_FILE))throw new Error('YCP_TOKEN and YCP_SETTINGS_FILE must be configured together');
 if(c.UNPAID_RETENTION_ENABLED==='true'&&!c.YCP_SETTINGS_FILE)throw new Error('Unpaid retention requires a YCP scope');
 // v10.1: Yandex owns CDEK order/shipment creation. Never start the obsolete order.paid dispatcher.
 if(c.FULFILLMENT_ENABLED==='true')throw new Error('ASAYA fulfillment dispatch is disabled: Yandex Checkout owns shipment creation');
 if(c.NODE_ENV==='production' && (c.COOKIE_SECURE!=='true'||!c.PUBLIC_ORIGIN.startsWith('https://'))) throw new Error('Production requires HTTPS and secure cookies');
 if(c.DEPLOYMENT_MODE==='catalog'&&(!c.STAFF_SECRET||c.YCP_TOKEN||c.YCP_SETTINGS_FILE))throw new Error('Catalog mode requires staff authentication and disables YCP');
 if(c.DEPLOYMENT_MODE==='ycp'&&(!c.STAFF_SECRET||!c.YCP_TOKEN||!c.YCP_SETTINGS_FILE))throw new Error('YCP mode requires staff authentication, an inbound token and settings');
 if(c.NODE_ENV==='production'&&c.DEPLOYMENT_MODE==='foundation')throw new Error('Foundation build: production startup is not enabled');
 if(c.YANDEX_ID_CLIENT_ID&&(c.COOKIE_SECURE!=='true'||new URL(c.PUBLIC_ORIGIN).protocol!=='https:'))throw new Error('Yandex ID requires HTTPS and secure cookies');
 return {...c,otpPolicy:otpPolicyFromEnv(env),customerSms:smsAeroFromEnv(env),cdekTracking:cdekTrackingFromEnv(env)};
}
