#!/bin/sh
set -eu
umask 077
cd /opt/asaya-catalog/current
dest=/opt/asaya-catalog/backups
mkdir -p "$dest"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
docker compose -f deploy/catalog/compose.yaml exec -T db pg_dump -U asaya_bootstrap -d asaya -Fc > "$dest/$stamp.dump.partial"
mv "$dest/$stamp.dump.partial" "$dest/$stamp.dump"
tar -czf "$dest/$stamp-config.tar.gz" -C /opt/asaya-catalog secrets -C /opt/asaya-shop deploy/Caddyfile
echo "Backup completed: $stamp"
