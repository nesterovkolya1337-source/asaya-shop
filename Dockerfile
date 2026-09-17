FROM node:22-alpine AS dependencies

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_CATALOG_SOURCE=backend ASAYA_BACKEND_ORIGIN=http://asaya-catalog-api:3100
ARG NEXT_PUBLIC_BASE_PATH=""
ENV NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH
ARG NEXT_PUBLIC_SITE_CONTENT=""
ENV NEXT_PUBLIC_SITE_CONTENT=$NEXT_PUBLIC_SITE_CONTENT
ARG NEXT_PUBLIC_CUSTOMER_AUTH=""
ENV NEXT_PUBLIC_CUSTOMER_AUTH=$NEXT_PUBLIC_CUSTOMER_AUTH

COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 NEXT_PUBLIC_CATALOG_SOURCE=backend ASAYA_BACKEND_ORIGIN=http://asaya-catalog-api:3100
COPY --from=builder --chown=node:node /app /app
USER node

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "node_modules/next/dist/bin/next", "start", "-H", "0.0.0.0", "-p", "80"]
