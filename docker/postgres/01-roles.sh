#!/bin/sh
# Crée les rôles et les bases au premier démarrage du conteneur.
#   app_owner : propriétaire des tables, utilisé pour les migrations
#   app_user  : utilisé par l'application, soumis à la Row Level Security
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<SQL
CREATE ROLE app_owner LOGIN PASSWORD '$APP_OWNER_PASSWORD';
CREATE ROLE app_user LOGIN PASSWORD '$APP_USER_PASSWORD' NOSUPERUSER NOBYPASSRLS;
CREATE DATABASE saas OWNER app_owner;
CREATE DATABASE saas_test OWNER app_owner;
SQL

for db in saas saas_test; do
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$db" <<SQL
REVOKE ALL ON DATABASE $db FROM PUBLIC;
GRANT CONNECT ON DATABASE $db TO app_user;
ALTER SCHEMA public OWNER TO app_owner;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO app_user;
ALTER DEFAULT PRIVILEGES FOR ROLE app_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES FOR ROLE app_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_user;
ALTER DEFAULT PRIVILEGES FOR ROLE app_owner IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO app_user;
SQL
done
