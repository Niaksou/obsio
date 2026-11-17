#!/bin/sh
# restic avec le dépôt hors du serveur (OFFSITE_REPOSITORY) et ses clés, lues dans les secrets.
# Sert au script de sauvegarde et aux commandes de l'éditeur (voir docs/deploiement.md) :
#   obsio run --rm --entrypoint /opt/obsio/restic.sh backup snapshots
set -eu
[ -n "${OFFSITE_REPOSITORY:-}" ] || { echo "OFFSITE_REPOSITORY manquant (deploy/server.env)" >&2; exit 1; }
export RESTIC_REPOSITORY="$OFFSITE_REPOSITORY"
export RESTIC_PASSWORD_FILE=/run/secrets/restic_password
AWS_ACCESS_KEY_ID=$(cat /run/secrets/offsite_access_key)
AWS_SECRET_ACCESS_KEY=$(cat /run/secrets/offsite_secret_key)
export AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY
export AWS_DEFAULT_REGION="${OFFSITE_REGION:-}"
export RESTIC_CACHE_DIR=/cache
exec restic "$@"
