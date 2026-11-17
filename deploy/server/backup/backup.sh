#!/bin/sh
# Sauvegarde quotidienne, à 3 h (heure de Paris), et au démarrage si celle du jour manque :
#   1. la base (pg_dump) dans BACKUP_DIR, sept jours conservés sur le serveur ;
#   2. hors du serveur, si OFFSITE_REPOSITORY est renseigné : copie du bucket du stockage (compte
#      en lecture seule), puis envoi chiffré de cette copie et de la sauvegarde de la base par
#      restic, qui garde des instantanés datés (7 quotidiens, 4 hebdomadaires, 6 mensuels) ;
#   3. le dimanche, contrôle du dépôt (structure et 5 % des données relues) et purge des données
#      des instantanés oubliés.
# En cas d'échec, e-mail à OPERATOR_EMAIL avec la fin du journal.
set -u
BACKUPS=/backups
FILES=$BACKUPS/fichiers
RESTIC=/opt/obsio/restic.sh

PGPASSWORD=$(cat /run/secrets/postgres_password)
export PGPASSWORD

# Bucket de l'application, lu par son adresse publique (certificat vérifié).
export RCLONE_CONFIG=/tmp/rclone.conf
: >"$RCLONE_CONFIG"
export RCLONE_CONFIG_SOURCE_TYPE=s3
export RCLONE_CONFIG_SOURCE_PROVIDER=Other
export RCLONE_CONFIG_SOURCE_ENDPOINT="$S3_ENDPOINT"
export RCLONE_CONFIG_SOURCE_REGION="$S3_REGION"
export RCLONE_CONFIG_SOURCE_FORCE_PATH_STYLE=true
RCLONE_CONFIG_SOURCE_ACCESS_KEY_ID=$(cat /run/secrets/s3_backup_access_key)
RCLONE_CONFIG_SOURCE_SECRET_ACCESS_KEY=$(cat /run/secrets/s3_backup_secret_key)
export RCLONE_CONFIG_SOURCE_ACCESS_KEY_ID RCLONE_CONFIG_SOURCE_SECRET_ACCESS_KEY

run() (
  set -e
  dump=$BACKUPS/obsio-$(date +%F).dump
  pg_dump -Fc obsio >"$dump.tmp"
  mv "$dump.tmp" "$dump"
  echo "Base : $dump ($(du -h "$dump" | cut -f1))"
  find "$BACKUPS" -maxdepth 1 -name 'obsio-*.dump' -mtime +7 -delete

  if [ -z "${OFFSITE_REPOSITORY:-}" ]; then
    echo "Sauvegarde hors du serveur désactivée : OFFSITE_REPOSITORY vide (deploy/server.env)."
    return 0
  fi
  [ -s /run/secrets/s3_backup_access_key ] || { echo "Secret s3_backup_access_key vide"; exit 1; }
  [ -s /run/secrets/offsite_access_key ] || { echo "Secret offsite_access_key vide"; exit 1; }

  mkdir -p "$FILES"
  # Peu de transferts en parallèle : le stockage et la sauvegarde partagent un petit serveur.
  rclone sync "source:$S3_BUCKET" "$FILES" --fast-list --transfers 2 --checkers 4 --stats 0
  # Chaque objet du bucket doit être dans la copie (une différence fait échouer la sauvegarde).
  rclone check "source:$S3_BUCKET" "$FILES" --size-only --one-way >/tmp/rclone-check.log 2>&1 ||
    { cat /tmp/rclone-check.log; exit 1; }
  echo "Fichiers : $(find "$FILES" -type f | wc -l) ($(du -sh "$FILES" | cut -f1))"

  $RESTIC cat config >/dev/null 2>&1 || $RESTIC init
  $RESTIC backup --host obsio --tag quotidienne --no-scan --quiet "$dump" "$FILES"
  $RESTIC forget --host obsio --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --quiet
  if [ "$(date +%u)" = 7 ]; then
    $RESTIC prune --quiet
    $RESTIC check --read-data-subset 5%
  fi
  $RESTIC snapshots --host obsio --latest 1 --compact
  echo "Sauvegarde hors du serveur terminée."
)

# E-mail d'alerte par le SMTP de l'application (TLS exigé quand il est authentifié).
alert() {
  log=$1
  subject="Obsio : échec de la sauvegarde du $(date +%F) sur ${APP_HOST:-le serveur}"
  from=$(printf '%s' "$MAIL_FROM" | sed -n 's/.*<\(.*\)>.*/\1/p')
  [ -n "$from" ] || from=$MAIL_FROM
  message=/tmp/alerte.eml
  {
    printf 'From: %s\r\nTo: %s\r\n' "$MAIL_FROM" "$OPERATOR_EMAIL"
    printf 'Subject: =?UTF-8?B?%s?=\r\n' "$(printf '%s' "$subject" | base64 | tr -d '\n')"
    printf 'Date: %s\r\n' "$(date -R)"
    printf 'MIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\n'
    printf 'Content-Transfer-Encoding: 8bit\r\n\r\n'
    printf 'La sauvegarde nocturne a échoué. Fin du journal :\r\n\r\n'
    tail -n 40 "$log" | sed 's/$/\r/'
    printf '\r\nJournal complet : obsio logs backup\r\n'
  } >"$message"
  if [ "$SMTP_PORT" = 465 ]; then url="smtps://$SMTP_HOST:465"; else url="smtp://$SMTP_HOST:$SMTP_PORT"; fi
  set -- --silent --show-error --url "$url" --mail-from "$from" --mail-rcpt "$OPERATOR_EMAIL" \
    --upload-file "$message"
  if [ -n "${SMTP_USER:-}" ]; then
    # Identifiants passés par l'entrée standard, pas dans la ligne de commande.
    printf 'user = "%s:%s"\n' "$SMTP_USER" "$(sed 's/[\\"]/\\&/g' /run/secrets/smtp_password)" |
      curl --ssl-reqd --tlsv1.2 --config - "$@"
  else
    curl "$@"
  fi && echo "Alerte envoyée à $OPERATOR_EMAIL." || echo "Alerte non envoyée."
}

backup() {
  log=/tmp/sauvegarde.log
  echo "Sauvegarde du $(date '+%F %H:%M')"
  run >"$log" 2>&1
  status=$?
  cat "$log"
  if [ "$status" -ne 0 ]; then
    echo "Échec de la sauvegarde (code $status)."
    alert "$log"
  fi
  return "$status"
}

# Secondes jusqu'à la prochaine heure de sauvegarde.
until_next() {
  now=$(date +%s)
  next=$(date -d "$(date +%F) 03:00" +%s)
  [ "$next" -gt "$now" ] || next=$((next + 86400))
  echo $((next - now))
}

case "${1:-}" in
  # obsio run --rm backup maintenant : une sauvegarde tout de suite, puis fin.
  maintenant) backup; exit $? ;;
  alerte-test) echo "Essai de l'alerte" >/tmp/essai.log; alert /tmp/essai.log; exit 0 ;;
esac

[ -e "$BACKUPS/obsio-$(date +%F).dump" ] || backup
while true; do
  sleep "$(until_next)"
  backup || true
done
