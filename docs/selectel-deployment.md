# ASAYA production deployment on Selectel

The current storefront is exported as static files and served from one Selectel
cloud server. Caddy terminates HTTPS and proxies requests to the private Nginx
container. The layout deliberately leaves room for the API and PostgreSQL
services required by the integration specification.

## Server profile

- Name: `asaya-prod`
- OS: Ubuntu 24.04 LTS
- 2 vCPU, 4 GB RAM, approximately 60 GB SSD
- Public IPv4 address
- Inbound TCP ports: 22, 80, 443
- Inbound UDP port: 443

## First deployment

Install Docker Engine and its Compose plugin using Docker's official Ubuntu
instructions. Clone the GitHub repository into `/opt/asaya-shop`, then run:

```sh
cd /opt/asaya-shop
docker compose up -d --build
docker compose ps
curl --fail http://127.0.0.1/healthz
```

Before Caddy can issue the certificate, point both DNS records at the server:

- `A asaya.ru` → the server public IPv4
- `A www.asaya.ru` → the server public IPv4

The authoritative DNS servers are currently `ns1.reg.ru` and `ns2.reg.ru`.

## Updating the site

```sh
cd /opt/asaya-shop
git pull --ff-only origin main
docker compose up -d --build
docker image prune -f
```

## Verification

```sh
docker compose ps
docker compose logs --tail=100 caddy web
curl --fail https://asaya.ru/healthz
```

Do not store Selectel, payment, delivery, database, or fulfillment credentials
in Git. They must be supplied as server-side secrets when the corresponding
backend services are implemented.
