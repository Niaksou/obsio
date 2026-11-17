# Sauvegarde du serveur (service backup de deploy/compose.server.yml) : pg_dump pour la base,
# rclone pour copier le bucket du stockage, restic pour l'envoi chiffré hors du serveur, curl
# pour l'alerte par e-mail.
FROM alpine:3.22
RUN apk add --no-cache ca-certificates curl postgresql17-client rclone restic tzdata
COPY backup.sh restic.sh /opt/obsio/
ENTRYPOINT ["/opt/obsio/backup.sh"]
