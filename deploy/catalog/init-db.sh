#!/bin/sh
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=app_password="$APP_PASSWORD" --set=owner_password="$OWNER_PASSWORD" <<'SQL'
CREATE ROLE asaya_owner LOGIN PASSWORD :'owner_password';
CREATE ROLE asaya_app LOGIN PASSWORD :'app_password';
REVOKE ALL ON DATABASE asaya FROM PUBLIC;
GRANT CONNECT ON DATABASE asaya TO asaya_owner, asaya_app;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO asaya_owner;
GRANT USAGE ON SCHEMA public TO asaya_app;
ALTER DEFAULT PRIVILEGES FOR ROLE asaya_owner IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO asaya_app;
ALTER DEFAULT PRIVILEGES FOR ROLE asaya_owner IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO asaya_app;
SQL
