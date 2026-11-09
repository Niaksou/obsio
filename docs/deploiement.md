# Déploiement sur un serveur

Toute l'application tourne sur un seul serveur virtuel (VPS) avec Docker : front, API, worker, PostgreSQL, Redis, stockage des fichiers (RustFS), et un proxy Caddy qui obtient seul les certificats HTTPS. Les e-mails partent par Brevo. Coût : le VPS (quelques euros par mois) et le nom de domaine.

Fichiers concernés : `deploy/compose.yml` (la pile), `deploy/compose.server.yml` (ajouts pour le serveur), `deploy/server/` (proxy et installation), `deploy/server.env.example` (variables).

Les exemples utilisent `preprod.obsio.fr` pour l'application et `stockage.preprod.obsio.fr` pour les fichiers : le navigateur y envoie directement photos et rapports.

## 1. Avant de commencer

- **VPS** : 2 vCores et 4 Go de mémoire au minimum, Debian 13 (ou Debian 12, Ubuntu 24.04), avec votre clé SSH. Hébergement dans l'Union européenne pour des données réelles (RGPD) : tant que le serveur est hors UE, uniquement des comptes et des rapports de test.
- **DNS** : dans la zone du domaine, deux enregistrements **A** vers l'adresse IP du VPS, `preprod` et `stockage.preprod`. Vérifier depuis votre poste qu'ils répondent avant de démarrer (Let's Encrypt en a besoin) :
  ```sh
  dig +short preprod.obsio.fr stockage.preprod.obsio.fr
  ```
- **Brevo** : compte gratuit, domaine d'envoi validé (enregistrements DNS fournis par Brevo à recopier dans la zone), identifiants SMTP dans « SMTP & API ».

## 2. Se connecter et récupérer le code

```sh
ssh debian@IP_DU_VPS          # « ubuntu@ » sur Ubuntu
```

Le dépôt GitHub est privé : le serveur le lit avec une clé de déploiement, en lecture seule.

```sh
ssh-keygen -t ed25519 -N '' -f ~/.ssh/obsio_deploy
cat ~/.ssh/obsio_deploy.pub
```

Sur GitHub : dépôt `obsio`, Settings > Deploy keys > Add deploy key, coller la clé, sans cocher « Allow write access ». Puis :

```sh
printf 'Host github.com\n  IdentityFile ~/.ssh/obsio_deploy\n' >> ~/.ssh/config
sudo apt-get update && sudo apt-get install -y git
git clone git@github.com:Niaksou/obsio.git && cd obsio
```

## 3. Préparer le serveur

```sh
sudo sh deploy/server/install.sh
```

Le script installe les mises à jour (puis les mises à jour de sécurité automatiques, avec redémarrage à 4 h si le noyau change), Docker, la mémoire d'échange (2 Go) et le dossier des sauvegardes `/var/backups/obsio`, et durcit le serveur (fichiers dans `deploy/server/hardening/`) :

- pare-feu qui n'ouvre que SSH (tentatives limitées), HTTP et HTTPS ; fail2ban bannit les adresses qui insistent ;
- SSH par clé uniquement, réservé à l'utilisateur courant, sans root, algorithmes récents ;
- noyau durci, pilotes et protocoles inutiles bloqués, journal d'audit (`sudo ausearch -k sudo`) ;
- conteneurs Docker sans élévation de privilèges, journaux bornés ;
- **sudo demande le mot de passe** de l'utilisateur (seulement s'il en a un) : une clé SSH volée ne suffit plus à administrer le serveur. À ranger dans un gestionnaire de mots de passe. Docker passe aussi par sudo : l'utilisateur n'est pas dans le groupe `docker`, qui équivaut à root.

Contrôle : `sudo lynis audit system` (indice de durcissement autour de 78/100 ; le reste concerne surtout des partitions séparées, impossibles sur un VPS).

### Pare-feu réseau OVH

En plus du pare-feu du serveur (ufw), le pare-feu réseau d'OVH filtre avant le serveur : il ne peut pas être désactivé depuis le serveur, et Docker ne le contourne pas. Espace client : Bare Metal Cloud > Adresses IP > l'IP du VPS > Edge Firewall. Source vide (toutes) et fragments décochés pour chaque règle :

| Séquence | Action | Protocole | Port source | Port de destination | Option TCP | Rôle |
|---|---|---|---|---|---|---|
| 0 | PERMIT | ICMP | | | | ping, diagnostic |
| 1 | PERMIT | TCP | | 22 | | SSH |
| 2 | PERMIT | TCP | | 80 | | HTTP (certificats) |
| 3 | PERMIT | TCP | | 443 | | HTTPS |
| 4 | PERMIT | UDP | | 443 | | HTTP/3 |
| 5 | PERMIT | TCP | | | ESTABLISHED | réponses aux connexions sortantes |
| 6 | PERMIT | UDP | 53 | | | réponses DNS |
| 7 | PERMIT | UDP | 123 | | | heure (NTP) |
| 19 | DENY | IPv4 | | | | tout le reste |

Ce pare-feu ne suit pas les connexions : sans les règles 5 à 7, le serveur ne recevrait plus les réponses à ses propres requêtes (mises à jour, DNS, Mistral, GitHub). Une fois les règles en place, l'activer avec l'interrupteur en haut de la page. En cas d'erreur, la console KVM de l'espace client reste accessible.

## 4. Configurer

```sh
cd obsio
cp deploy/server.env.example deploy/server.env
chmod 600 deploy/server.env
openssl rand -hex 32          # une fois par mot de passe et pour BETTER_AUTH_SECRET
openssl rand -hex 16          # pour S3_ACCESS_KEY et S3_SECRET_KEY
nano deploy/server.env
```

Remplacer chaque `changer-moi`, ajuster les adresses si le domaine diffère, et renseigner `MISTRAL_API_KEY` pour l'extraction des rapports. Ce fichier contient les secrets : il reste sur le serveur, hors du dépôt.

## 5. Démarrer

Raccourci, à ajouter une fois pour toutes :

```sh
echo "alias obsio='sudo docker compose -f ~/obsio/deploy/compose.yml -f ~/obsio/deploy/compose.server.yml --env-file ~/obsio/deploy/server.env'" >> ~/.bashrc
source ~/.bashrc
```

```sh
obsio up -d --build --wait
```

La première construction prend plusieurs minutes. Ensuite, https://preprod.obsio.fr répond (le certificat est obtenu à la première visite, quelques secondes).

Ouvrir un client (pas d'inscription libre) ; le responsable reçoit l'invitation par e-mail :

```sh
obsio exec api node dist/cli/create-organisation.js "Usine Test" responsable@exemple.fr
```

### Sans Brevo (en test)

Les e-mails peuvent rester sur le serveur, dans Mailpit, au lieu de partir : variables décrites dans `deploy/server.env.example`. Mailpit n'écoute que sur le serveur lui-même ; pour lire les e-mails (liens d'invitation compris), ouvrir un tunnel depuis son poste puis http://localhost:8125 :

```sh
ssh -N -L 8125:127.0.0.1:8125 debian@IP_DU_VPS
```

Pour une démonstration, une fois le compte de l'administrateur créé (lien de l'invitation), remplir son organisation avec des données fictives (deux sites, plans, rapports, réserves à tous les stades, intervenants) ; la commande affiche les liens d'intervention à ouvrir sur un téléphone :

```sh
obsio exec api node dist/cli/seed-demo.js responsable@exemple.fr
```

## Au quotidien

Après une mise à jour qui ajoute une variable à `deploy/server.env.example` (par exemple `REDIS_PASSWORD`), l'ajouter à `deploy/server.env` avant de relancer : sans elle, `docker compose` refuse de démarrer et nomme la variable manquante.

Passage au compte de stockage restreint (novembre 2026) : dans `deploy/server.env`, renommer `S3_ACCESS_KEY` et `S3_SECRET_KEY` en `S3_ADMIN_ACCESS_KEY` et `S3_ADMIN_SECRET_KEY` (le compte principal de RustFS ne change pas), puis ajouter un nouveau `S3_ACCESS_KEY` (par exemple `obsio-app`) et un nouveau `S3_SECRET_KEY` (`openssl rand -hex 32`) : `setup` crée ce compte au démarrage.

| Besoin | Commande |
|---|---|
| Mettre à jour après un `git push` | `cd ~/obsio && git pull && obsio up -d --build --wait` |
| État des services | `obsio ps` |
| Journaux (ici de l'API) | `obsio logs -f --tail 100 api` |
| Arrêter / relancer | `obsio stop` / `obsio up -d --wait` |

Les services redémarrent seuls après un redémarrage du serveur. Les migrations de la base passent à chaque démarrage.

## Demande d'un client : export ou suppression de ses données

Retrouver l'identifiant de l'organisation dans la sortie de `create-organisation.js`, ou par son slug (le nom en minuscules suivi de huit caractères, visible dans la base). Le conteneur de l'API est en lecture seule : l'archive passe par la sortie standard.

```sh
obsio exec -T api node dist/cli/export-organisation.js <identifiant ou slug> --out - > obsio-export.zip
```

La suppression est définitive. Elle passe par le service `setup`, seul à disposer du rôle propriétaire de la base (l'API ne l'a pas). Sans `--confirm`, la commande décrit seulement ce qu'elle supprimerait :

```sh
obsio run --rm setup node dist/cli/delete-organisation.js <identifiant ou slug>
obsio run --rm setup node dist/cli/delete-organisation.js <identifiant> --confirm "Nom exact"
```

Conserver la ligne datée qu'elle affiche à la fin (registre des demandes RGPD) : c'est la seule trace de la suppression. Les sauvegardes de la base gardent les données supprimées jusqu'à sept jours.

## Double authentification perdue

Un utilisateur qui a perdu son téléphone et ses codes de secours demande une réinitialisation. Vérifier d'abord son identité auprès de l'admin de son organisation, par téléphone (jamais sur la seule foi d'un e-mail), puis :

```sh
obsio exec -T api node dist/cli/reset-two-factor.js <e-mail>
```

Ses sessions sont fermées ; à sa prochaine connexion, avec son mot de passe, il configure une nouvelle application.

## Sauvegardes

La base est sauvegardée au démarrage puis toutes les 24 heures dans `/var/backups/obsio` (sept jours conservés). Les fichiers (photos, rapports) restent dans le volume Docker du stockage, sans sauvegarde à ce stade.

Copier une sauvegarde sur son poste :

```sh
scp debian@IP_DU_VPS:/var/backups/obsio/obsio-2026-11-02.dump .
```

Restaurer (remplace le contenu actuel de la base) :

```sh
obsio stop api worker
obsio exec -T postgres pg_restore -U postgres -d obsio --clean --if-exists < /var/backups/obsio/obsio-2026-11-02.dump
obsio up -d --wait
```

## Changer de serveur

Recommencer les étapes 2 à 5 sur le nouveau, restaurer la dernière sauvegarde, copier le volume du stockage, puis faire pointer les enregistrements DNS vers la nouvelle adresse IP.
