#!/bin/sh
# Prépare un VPS Debian 12/13 ou Ubuntu 24.04 neuf pour Obsio (guide : docs/deploiement.md).
# À lancer une fois, avec sudo, depuis le dossier du dépôt : sudo sh deploy/server/install.sh
#
# - mises à jour du système, puis mises à jour de sécurité automatiques
# - Docker et Docker Compose, depuis le dépôt officiel de Docker
# - pare-feu : seuls SSH, HTTP et HTTPS sont ouverts
# - 2 Go de mémoire d'échange, pour que la construction des images passe sur un petit serveur
# - dossier des sauvegardes de la base
set -eu

if [ "$(id -u)" -ne 0 ]; then
  echo "À lancer avec sudo : sudo sh deploy/server/install.sh" >&2
  exit 1
fi
user="${SUDO_USER:-}"
export DEBIAN_FRONTEND=noninteractive

echo "== Mises à jour du système"
apt-get update
apt-get -y upgrade
apt-get install -y ca-certificates curl git ufw unattended-upgrades
dpkg-reconfigure -f noninteractive unattended-upgrades

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
# Docker sans sudo pour l'utilisateur courant (effectif à la prochaine connexion).
[ -n "$user" ] && usermod -aG docker "$user"

echo "== Pare-feu"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443
ufw --force enable

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

echo
echo "Serveur prêt. Déconnectez-vous puis reconnectez-vous (pour utiliser docker sans sudo),"
echo "puis suivez la suite de docs/deploiement.md."
