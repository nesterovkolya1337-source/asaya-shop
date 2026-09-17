import type { NextConfig } from "next";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const backendCatalog = process.env.NEXT_PUBLIC_CATALOG_SOURCE !== 'demo';
const backendOrigin = process.env.ASAYA_BACKEND_ORIGIN ?? 'http://127.0.0.1:3100';
if (backendCatalog && !/^http:\/\/(?:(?:127\.0\.0\.1|localhost):\d+|asaya-catalog-api:3100)$/.test(backendOrigin)) {
  throw new Error('Catalog requires a loopback or dedicated internal ASAYA_BACKEND_ORIGIN');
}

const nextConfig: NextConfig = {
  output: backendCatalog ? undefined : "export",
  ...(backendCatalog ? {async redirects(){return [
    {source:'/legal/cookies/:slash*',destination:'/legal/privacy/',statusCode:301},
    {source:'/offer',destination:'/legal/offer/',statusCode:301},
    {source:'/payment',destination:'/delivery/',statusCode:301},
    {source:'/return',destination:'/returns/',statusCode:301},
    {source:'/order-status/:slash*',destination:'/account/#orders',statusCode:301},
  ];}} : {}),
  ...(backendCatalog ? { async rewrites() { return ['account/profile','content/:page','yandex/checkout-link','yandex/feed.xml','media/:id','products','auth/me','auth/methods','auth/yandex/start','auth/yandex/callback','auth/otp/request','auth/otp/verify','auth/logout','orders','orders/:id','orders/:id/cancel','delivery/quotes','checkouts','checkouts/by-key/:key']
    .map(path=>({source:`/api/store/v1/${path}`,destination:`${backendOrigin}/api/store/v1/${path}`}))
    .concat(['site-pages/:page','site-pages/:page/publish','site-pages/:page/restore','readiness','integration-issues','statistics','orders/:id/fulfillment/recheck','orders/:id/complete','orders/:id/dispatch','orders/:id/complete-packing','orders/:id/start-processing','orders','orders/:id','orders/:id/cancel','media','auth/login','auth/me','auth/logout','products','products/:id','products/:id/publish','products/:id/unpublish','products/:id/stock','products/:id/history'].map(path=>({source:`/api/admin/v1/${path}`,destination:`${backendOrigin}/api/admin/v1/${path}`}))); } } : {}),
  basePath,
  trailingSlash: true,
  experimental: {
    cpus: 1,
  },
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
