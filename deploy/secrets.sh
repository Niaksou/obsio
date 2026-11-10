#!/bin/sh
# Secrets du déploiement (ASVS 13.3.1) : un fichier par secret, monté par Docker dans
# /run/secrets des seuls services qui en ont besoin. L'exemplaire de référence est un fichier
# chiffré par SOPS avec une clé age que seul l'éditeur détient ; le serveur ne reçoit que les
# fichiers déchiffrés, dans un dossier lisible par root seulement.
#
#   deploy/secrets.sh generer <dossier>                  secrets aléatoires et adresses dérivées
#   deploy/secrets.sh importer <fichier.env> <dossier>   reprend les secrets d'un ancien fichier de variables
#   deploy/secrets.sh deriver <dossier>                  recalcule les adresses (après une modification)
#   deploy/secrets.sh certificats <dossier>              renouvelle l'autorité et les certificats internes
#   deploy/secrets.sh chiffrer <dossier> <fichier.sops.yaml>    (SOPS_AGE_RECIPIENTS : clé publique age)
#   deploy/secrets.sh dechiffrer <fichier.sops.yaml> <dossier>  (SOPS_AGE_KEY_FILE : clé privée)
#   deploy/secrets.sh envoyer <fichier.sops.yaml> <hôte ssh> [dossier distant]
#
# Prérequis sur le poste : sops et age (brew install sops age).
set -eu

# Secrets tirés au hasard, puis secrets fournis par des services externes (laissés vides).
GENERATED="postgres_password app_owner_password app_user_password redis_password s3_admin_access_key s3_admin_secret_key s3_access_key s3_secret_key better_auth_secret"
EXTERNAL="smtp_password mistral_api_key betterstack_token"
DERIVED="database_url database_owner_url redis_url"
# Chiffrement entre les services (ASVS 12.3.3) : un certificat par service, signé par une
# autorité interne dont la clé est détruite aussitôt (le renouvellement refait tout).
TLS_SERVICES="postgres redis api web storage"
TLS_DAYS=730
TLS=tls_ca
for service in $TLS_SERVICES; do TLS="$TLS tls_${service}_cert tls_${service}_key"; done
STORED="$GENERATED $EXTERNAL $TLS"
REMOTE_DIR_DEFAULT=/etc/obsio/secrets

usage() {
  sed -n '7,15p' "$0" | sed 's/^# \{0,1\}//' >&2
  exit 1
}

random_hex() { openssl rand -hex "$1"; }

# Dossier fermé à tous sauf à son propriétaire ; fichiers lisibles par les conteneurs qui les
# montent (PostgreSQL, Redis et l'application tournent sous des utilisateurs différents).
protect() {
  chmod 700 "$1"
  chmod 644 "$1"/*
}

# Adresses de connexion, recalculées à partir des mots de passe : elles restent cohérentes.
derive() {
  dir=$1
  # TLS exigé, certificat vérifié (autorité interne, nom du service).
  printf 'postgres://app_user:%s@postgres:5432/obsio?sslmode=verify-full' "$(cat "$dir/app_user_password")" >"$dir/database_url"
  printf 'postgres://app_owner:%s@postgres:5432/obsio?sslmode=verify-full' "$(cat "$dir/app_owner_password")" >"$dir/database_owner_url"
  printf 'rediss://:%s@redis:6379' "$(cat "$dir/redis_password")" >"$dir/redis_url"
}

certificates() {
  dir=$1
  work=$(mktemp -d)
  openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -pkeyopt ec_param_enc:named_curve -out "$work/ca.key" 2>/dev/null
  openssl req -x509 -new -key "$work/ca.key" -subj "/CN=Obsio autorite interne" -days "$TLS_DAYS" \
    -sha256 -addext "basicConstraints=critical,CA:true,pathlen:0" \
    -addext "keyUsage=critical,keyCertSign,cRLSign" -out "$dir/tls_ca"
  for service in $TLS_SERVICES; do
    key="$dir/tls_${service}_key"
    openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -pkeyopt ec_param_enc:named_curve -out "$key" 2>/dev/null
    # Nom du service sur le réseau Docker, et localhost pour les contrôles de santé.
    printf '%s\n' "basicConstraints=critical,CA:false" "keyUsage=critical,digitalSignature" \
      "extendedKeyUsage=serverAuth" "subjectAltName=DNS:$service,DNS:localhost,IP:127.0.0.1" \
      >"$work/ext"
    openssl req -new -key "$key" -subj "/CN=$service" |
      openssl x509 -req -CA "$dir/tls_ca" -CAkey "$work/ca.key" -set_serial "0x$(openssl rand -hex 16)" \
        -days "$TLS_DAYS" -sha256 -extfile "$work/ext" -out "$dir/tls_${service}_cert" 2>/dev/null
  done
  rm -rf "$work"
  echo "Certificats internes valables $TLS_DAYS jours ($(openssl x509 -in "$dir/tls_ca" -noout -enddate))."
}

generate() {
  dir=$1
  mkdir -p "$dir"
  chmod 700 "$dir"
  for name in $GENERATED; do
    [ -s "$dir/$name" ] && continue
    case $name in
      s3_admin_access_key) printf 'obsio-admin' >"$dir/$name" ;;
      s3_access_key) printf 'obsio-app' >"$dir/$name" ;;
      better_auth_secret) openssl rand -base64 32 | tr -d '\n' >"$dir/$name" ;;
      # RustFS limite la longueur des clés : 128 bits.
      s3_*) random_hex 16 | tr -d '\n' >"$dir/$name" ;;
      *) random_hex 32 | tr -d '\n' >"$dir/$name" ;;
    esac
  done
  for name in $EXTERNAL; do [ -e "$dir/$name" ] || : >"$dir/$name"; done
  [ -s "$dir/tls_ca" ] || certificates "$dir"
  derive "$dir"
  protect "$dir"
  echo "Secrets dans $dir. À compléter : $EXTERNAL (vides si le service n'est pas utilisé)."
}

# Ancien déploiement (secrets dans le fichier de variables) : on garde les mêmes valeurs, car
# les rôles PostgreSQL et le compte principal du stockage existent déjà avec elles.
import_env() {
  env=$1 dir=$2
  mkdir -p "$dir"
  chmod 700 "$dir"
  for name in $GENERATED $EXTERNAL; do
    variable=$(echo "$name" | tr '[:lower:]' '[:upper:]')
    sed -n "s/^$variable=//p" "$env" | tail -1 | sed 's/^"\(.*\)"$/\1/; s/^'"'"'\(.*\)'"'"'$/\1/' |
      tr -d '\n' >"$dir/$name"
  done
  derive "$dir"
  protect "$dir"
  for name in $GENERATED; do
    [ -s "$dir/$name" ] || echo "Absent de $env : $name (deploy/secrets.sh generer $dir le tire au hasard)" >&2
  done
}

# Fichier YAML « nom: valeur », chiffré valeur par valeur ; les sauts de ligne (certificats)
# sont écrits \n, le dernier est omis.
encrypt() {
  dir=$1 out=$2
  [ -n "${SOPS_AGE_RECIPIENTS:-}" ] || { echo "SOPS_AGE_RECIPIENTS manquant (clé publique age)" >&2; exit 1; }
  plain=$(mktemp)
  trap 'rm -f "$plain"' EXIT
  for name in $STORED; do
    value=$(sed 's/["\\]/\\&/g' "$dir/$name" | awk '{ printf "%s%s", (NR > 1 ? "\\n" : ""), $0 }')
    printf '%s: "%s"\n' "$name" "$value" >>"$plain"
  done
  sops encrypt --input-type yaml --output-type yaml --age "$SOPS_AGE_RECIPIENTS" "$plain" >"$out"
  echo "Chiffré dans $out : à conserver hors du dépôt (gestionnaire de mots de passe, sauvegarde)."
}

decrypt() {
  file=$1 dir=$2
  mkdir -p "$dir"
  chmod 700 "$dir"
  for name in $STORED; do
    value=$(sops decrypt --input-type yaml --output-type yaml --extract "[\"$name\"]" "$file")
    case $name in
      tls_*) printf '%s\n' "$value" >"$dir/$name" ;;
      *) printf '%s' "$value" >"$dir/$name" ;;
    esac
  done
  derive "$dir"
  protect "$dir"
}

# Déchiffre sur le poste, puis dépose les fichiers sur le serveur : archive en mémoire vive
# (/dev/shm, lisible par l'utilisateur SSH seul), installée par sudo (mot de passe demandé)
# dans un dossier 0700 de root, puis effacée. Fichiers lisibles par les conteneurs qui les montent.
send() {
  file=$1 host=$2 remote=${3:-$REMOTE_DIR_DEFAULT}
  tmp=$(mktemp -d)
  trap 'rm -rf "$tmp"' EXIT
  decrypt "$file" "$tmp"
  archive=/dev/shm/obsio-secrets.tar
  # COPYFILE_DISABLE : sans les fichiers ._* que le tar de macOS ajoute (attributs étendus).
  COPYFILE_DISABLE=1 tar -C "$tmp" -cf - . | ssh "$host" "umask 077 && cat >$archive"
  ssh -t "$host" "sudo sh -c 'mkdir -p $remote && find $remote -mindepth 1 -delete && tar -xf $archive -C $remote && chown -R root:root $remote && chmod 0444 $remote/* && chmod 0700 $remote'; status=\$?; rm -f $archive; exit \$status"
  echo "Secrets déposés dans $host:$remote ; relancer les services pour les prendre en compte."
}

[ $# -ge 2 ] || usage
command=$1
shift
case $command in
  generer) generate "$1" ;;
  importer) [ $# -eq 2 ] || usage; import_env "$1" "$2" ;;
  certificats) certificates "$1"; protect "$1" ;;
  deriver) derive "$1" ;;
  chiffrer) [ $# -eq 2 ] || usage; encrypt "$1" "$2" ;;
  dechiffrer) [ $# -eq 2 ] || usage; decrypt "$1" "$2" ;;
  envoyer) [ $# -ge 2 ] || usage; send "$@" ;;
  *) usage ;;
esac
