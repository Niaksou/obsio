#!/bin/sh
# Prépare un VPS Debian 12/13 ou Ubuntu 24.04 neuf pour Obsio (guide : docs/deploiement.md).
# À lancer une fois, avec sudo, depuis le dossier du dépôt : sudo sh deploy/server/install.sh
#
# - mises à jour du système, puis mises à jour de sécurité automatiques
# - Docker et Docker Compose, depuis le dépôt officiel de Docker
# - pare-feu : seuls SSH (tentatives limitées), HTTP et HTTPS sont ouverts ; fail2ban
# - SSH par clé uniquement, sans root, algorithmes récents
# - noyau durci (sysctl), journal d'audit (auditd), services réseau inutiles coupés
# - Docker : pas d'élévation de privilèges dans les conteneurs, journaux bornés
# - sudo avec mot de passe (si l'utilisateur en a un), Docker uniquement par sudo
# - 2 Go de mémoire d'échange, pour que la construction des images passe sur un petit serveur
# - dossier des sauvegardes de la base
# Fichiers de configuration : deploy/server/hardening/. Relançable sans risque.
set -eu

if [ "$(id -u)" -ne 0 ]; then
  echo "À lancer avec sudo : sudo sh deploy/server/install.sh" >&2
  exit 1
fi
user="${SUDO_USER:-}"
conf="$(dirname "$0")/hardening"
export DEBIAN_FRONTEND=noninteractive

echo "== Mises à jour du système"
apt-get update
apt-get -y upgrade
apt-get install -y ca-certificates curl git ufw unattended-upgrades fail2ban python3-systemd \
  auditd lynis needrestart libpam-tmpdir debsums
dpkg-reconfigure -f noninteractive unattended-upgrades
install -m 0644 "$conf/unattended-upgrades.conf" /etc/apt/apt.conf.d/52obsio

echo "== Docker"
if ! command -v docker >/dev/null 2>&1; then
  . /etc/os-release
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL "https://download.docker.com/linux/$ID/gpg" -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/$ID $VERSION_CODENAME stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
# Le groupe docker équivaut à root : Docker passe par sudo, et donc par le mot de passe.
if [ -n "$user" ] && id -nG "$user" | grep -qw docker; then gpasswd -d "$user" docker; fi
install -m 0644 -D "$conf/docker-daemon.json" /etc/docker/daemon.json
systemctl restart docker

echo "== Pare-feu"
ufw delete allow OpenSSH >/dev/null 2>&1 || true
ufw limit OpenSSH
ufw allow 80/tcp
ufw allow 443
ufw --force enable

echo "== SSH"
# Seulement si l'utilisateur a déjà une clé, pour ne pas se fermer la porte.
home="$( [ -n "$user" ] && getent passwd "$user" | cut -d: -f6 || true)"
if [ -n "$home" ] && [ -s "$home/.ssh/authorized_keys" ]; then
  target=/etc/ssh/sshd_config.d/00-obsio.conf
  [ -f "$target" ] && cp "$target" "$target.bak"
  install -m 0644 "$conf/issue.net" /etc/issue.net
  { cat "$conf/sshd.conf"; echo "AllowUsers $user"; } > "$target"
  # Configuration refusée : on remet l'ancienne, pour que le prochain redémarrage de SSH passe.
  if ! sshd -t; then
    if [ -f "$target.bak" ]; then mv "$target.bak" "$target"; else rm -f "$target"; fi
    echo "Configuration SSH refusée, ancienne configuration remise." >&2
    exit 1
  fi
  rm -f "$target.bak"
  systemctl reload ssh
else
  echo "Aucune clé SSH pour $user : connexion par mot de passe laissée ouverte." >&2
fi
install -m 0644 "$conf/fail2ban.local" /etc/fail2ban/jail.d/obsio.local
systemctl enable fail2ban
systemctl restart fail2ban

echo "== Système"
install -m 0644 "$conf/sysctl.conf" /etc/sysctl.d/90-obsio.conf
sysctl -q --system
install -m 0644 -D "$conf/resolved.conf" /etc/systemd/resolved.conf.d/obsio.conf
systemctl restart systemd-resolved 2>/dev/null || true
install -m 0640 "$conf/audit.rules" /etc/audit/rules.d/obsio.rules
augenrules --load >/dev/null
# Répertoires personnels et tâches planifiées fermés aux autres utilisateurs ; umask plus strict.
chmod 0750 /home/*
for dir in /etc/cron.d /etc/cron.daily /etc/cron.hourly /etc/cron.weekly /etc/cron.monthly; do
  if [ -d "$dir" ]; then chmod 0700 "$dir"; fi
done
if [ -f /etc/crontab ]; then chmod 0600 /etc/crontab; fi
sed -i 's/^UMASK.*/UMASK\t\t027/' /etc/login.defs
install -m 0644 "$conf/modprobe.conf" /etc/modprobe.d/obsio.conf
# Services relancés seuls après une mise à jour de bibliothèque.
sed -i "s/^#\?\$nrconf{restart} = .*/\$nrconf{restart} = 'a';/" /etc/needrestart/needrestart.conf

echo "== Mémoire d'échange"
if [ -z "$(swapon --show)" ]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "== Sauvegardes"
install -m 0700 -d /var/backups/obsio

echo "== sudo"
# Mot de passe exigé pour sudo : une clé SSH volée ne suffit plus à administrer le serveur.
# Seulement si l'utilisateur a un mot de passe, sinon il perdrait l'accès administrateur.
if [ -n "$user" ] && [ "$(passwd -S "$user" | cut -d' ' -f2)" = P ]; then
  tmp="$(mktemp)"
  printf 'Defaults use_pty\nDefaults logfile=/var/log/sudo.log\nDefaults timestamp_timeout=5\n%s ALL=(ALL:ALL) ALL\n' "$user" > "$tmp"
  visudo -cqf "$tmp" && install -m 0440 "$tmp" /etc/sudoers.d/99-obsio
  rm -f "$tmp"
else
  echo "Pas de mot de passe pour $user : sudo reste sans mot de passe." >&2
fi

echo
echo "Serveur prêt. Suite : docs/deploiement.md."
