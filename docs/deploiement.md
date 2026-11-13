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

Les adresses et réglages sont dans `deploy/server.env`, sans aucun secret :

```sh
cd obsio
cp deploy/server.env.example deploy/server.env
nano deploy/server.env
```

Remplacer chaque `changer-moi` et ajuster les adresses si le domaine diffère.

### Secrets (sur son poste, pas sur le serveur)

Les secrets (mots de passe de la base, de Redis et du stockage, clé de session, clé des notifications, clés Brevo, Mistral et Better Stack) sont un fichier par secret, montés par Docker dans `/run/secrets` des seuls services qui en ont besoin : ils n'apparaissent ni dans les variables des conteneurs, ni dans `docker inspect`. L'exemplaire de référence est un fichier chiffré par [SOPS](https://getsops.io) avec une clé [age](https://age-encryption.org) que seul l'éditeur détient ; le serveur ne reçoit que les fichiers déchiffrés, dans `/etc/obsio/secrets`, lisible par root seulement.

Une seule fois, sur son poste :

```sh
brew install sops age
mkdir -p ~/.config/sops/age
age-keygen -o ~/.config/sops/age/keys.txt    # clé privée : la sauvegarder dans un gestionnaire de mots de passe
```

La ligne `public key: age1…` affichée est la clé publique. Dans `~/.zshrc` :

```sh
export SOPS_AGE_KEY_FILE=~/.config/sops/age/keys.txt
export SOPS_AGE_RECIPIENTS=age1…    # la clé publique
```

Sans la clé privée, les secrets chiffrés sont perdus : il faudrait les régénérer (et réinitialiser la base).

Créer les secrets, compléter les clés des services externes, puis chiffrer et effacer les fichiers en clair :

```sh
deploy/secrets.sh generer ~/obsio-secrets
nano ~/obsio-secrets/smtp_password ~/obsio-secrets/mistral_api_key ~/obsio-secrets/betterstack_token
deploy/secrets.sh chiffrer ~/obsio-secrets ~/obsio-secrets.sops.yaml
rm -r ~/obsio-secrets
```

Le fichier `obsio-secrets.sops.yaml` peut être sauvegardé n'importe où (les valeurs sont chiffrées), jamais dans le dépôt. Pour modifier un secret : `sops edit ~/obsio-secrets.sops.yaml`.

Déposer les secrets sur le serveur (à refaire après chaque modification, puis relancer les services) :

```sh
deploy/secrets.sh envoyer ~/obsio-secrets.sops.yaml debian@IP_DU_VPS
```

Les fichiers sont déchiffrés sur le poste, transmis par SSH en mémoire vive (`/dev/shm`), puis installés par sudo (mot de passe du serveur demandé) dans `/etc/obsio/secrets`, dossier de root en 0700 ; l'archive est aussitôt effacée.

## 5. Démarrer

Raccourci, à ajouter une fois pour toutes :

```sh
echo "alias obsio='sudo docker compose -f ~/obsio/deploy/compose.yml -f ~/obsio/deploy/compose.server.yml --env-file ~/obsio/deploy/server.env'" >> ~/.bashrc
source ~/.bashrc
```

```sh
obsio up -d --build --wait
```

La première construction prend plusieurs minutes, et le premier démarrage de l'antivirus aussi : ClamAV télécharge ses signatures (environ 300 Mo) avant que l'API démarre. Il occupe ensuite environ 1 Go de mémoire. Ensuite, https://preprod.obsio.fr répond (le certificat est obtenu à la première visite, quelques secondes).

Ouvrir un client (pas d'inscription libre) ; le responsable reçoit l'invitation par e-mail :

```sh
obsio exec api node dist/cli/create-organisation.js "Usine Test" responsable@exemple.fr
```

Ou depuis la console Obsio (https://preprod.obsio.fr/console), qui fixe aussi la licence du client. La console est réservée aux comptes de l'équipe : le compte doit déjà exister (invité dans une organisation, double authentification activée), puis il est nommé avec le rôle propriétaire de la base. Elle s'ouvre avec une clé d'accès, à créer dans « Mon compte » :

```sh
obsio run --rm setup node dist/cli/grant-staff.js prenom@obsio.fr            # --revoke pour retirer
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

Après une mise à jour qui ajoute une variable à `deploy/server.env.example`, l'ajouter à `deploy/server.env` avant de relancer : sans elle, `docker compose` refuse de démarrer et nomme la variable manquante. Un nouveau secret s'ajoute avec `sops edit`, puis `deploy/secrets.sh envoyer`.

Passage aux secrets Docker (novembre 2026), pour un serveur dont les secrets sont encore dans `deploy/server.env` : récupérer le fichier sur son poste, en reprendre les valeurs (la base et le stockage existent déjà avec elles), les chiffrer et les envoyer, puis retirer les secrets du fichier du serveur :

```sh
scp debian@IP_DU_VPS:obsio/deploy/server.env /tmp/ancien.env
deploy/secrets.sh importer /tmp/ancien.env ~/obsio-secrets
deploy/secrets.sh generer ~/obsio-secrets          # ne complète que les secrets absents
deploy/secrets.sh chiffrer ~/obsio-secrets ~/obsio-secrets.sops.yaml
rm -r ~/obsio-secrets /tmp/ancien.env
deploy/secrets.sh envoyer ~/obsio-secrets.sops.yaml debian@IP_DU_VPS
```

Sur le serveur, mettre `deploy/server.env` à jour d'après `deploy/server.env.example` (ajouter `SECRETS_DIR=/etc/obsio/secrets`, supprimer les lignes des mots de passe, clés et jetons), puis `obsio up -d --build --wait`.

Chiffrement entre les services (novembre 2026) : les certificats internes font partie des secrets. Pour un fichier chiffré créé avant, les ajouter puis renvoyer (les adresses de la base et de Redis passent en TLS au passage) :

```sh
deploy/secrets.sh dechiffrer ~/obsio-secrets.sops.yaml ~/obsio-secrets
deploy/secrets.sh generer ~/obsio-secrets          # ajoute l'autorité interne et les certificats
deploy/secrets.sh chiffrer ~/obsio-secrets ~/obsio-secrets.sops.yaml
rm -r ~/obsio-secrets
deploy/secrets.sh envoyer ~/obsio-secrets.sops.yaml debian@IP_DU_VPS
```

Notifications sur le téléphone (novembre 2026) : la clé VAPID (`vapid_private_key`) fait partie des secrets. Pour un fichier chiffré créé avant, l'ajouter puis renvoyer ; sans elle, l'API démarre sans notifications (l'e-mail reste) :

```sh
deploy/secrets.sh dechiffrer ~/obsio-secrets.sops.yaml ~/obsio-secrets
deploy/secrets.sh generer ~/obsio-secrets          # ajoute la clé VAPID
deploy/secrets.sh chiffrer ~/obsio-secrets ~/obsio-secrets.sops.yaml
rm -r ~/obsio-secrets
deploy/secrets.sh envoyer ~/obsio-secrets.sops.yaml debian@IP_DU_VPS
obsio up -d --build --wait
```

Ne pas changer cette clé sans raison : les appareils abonnés ne recevraient plus rien et devraient réactiver les notifications.

Les certificats internes sont valables deux ans (date affichée à leur création). Avant l'échéance, les refaire tous, avec une nouvelle autorité, puis relancer tous les services :

```sh
deploy/secrets.sh dechiffrer ~/obsio-secrets.sops.yaml ~/obsio-secrets
deploy/secrets.sh certificats ~/obsio-secrets
deploy/secrets.sh chiffrer ~/obsio-secrets ~/obsio-secrets.sops.yaml
rm -r ~/obsio-secrets
deploy/secrets.sh envoyer ~/obsio-secrets.sops.yaml debian@IP_DU_VPS
obsio up -d --force-recreate --wait
```

| Besoin | Commande |
|---|---|
| Mettre à jour après un `git push` | `cd ~/obsio && git pull && obsio up -d --build --wait` |
| État des services | `obsio ps` |
| Journaux (ici de l'API) | `obsio logs -f --tail 100 api` |
| Arrêter / relancer | `obsio stop` / `obsio up -d --wait` |

Les services redémarrent seuls après un redémarrage du serveur. Les migrations de la base passent à chaque démarrage.

## Journaux hors du serveur (Better Stack)

Les journaux de tous les conteneurs partent vers Better Stack, en Allemagne : ils restent consultables si le serveur tombe, et quelqu'un qui en prendrait le contrôle ne pourrait pas effacer ses traces.

1. Créer un compte sur https://betterstack.com, puis **Telemetry > Sources > Connect source** : plateforme **Vector**, centre de données **Europe (Germany)**.
2. Copier l'adresse d'ingestion (`s….eu-nbg-2.betterstackdata.com`) dans `deploy/server.env` (`BETTERSTACK_HOST`), avec `COMPOSE_PROFILES=journaux` (`local,journaux` si Mailpit est utilisé), et le jeton de la source dans le secret `betterstack_token` (`sops edit`, puis `deploy/secrets.sh envoyer`).
3. `obsio up -d --wait`, puis vérifier dans Better Stack (**Live tail**) que les lignes arrivent.
4. Créer une alerte sur les événements de sécurité : requête `securite:true`, par exemple plus de 20 `acces-refuse` ou un `fichier-infecte` en 5 minutes.

Les journaux contiennent des adresses IP et, pour les événements d'authentification, l'adresse e-mail saisie : Better Stack est un sous-traitant au sens du RGPD (accord de traitement à accepter dans son compte, à inscrire au registre). L'offre gratuite garde 3 jours ; prévoir une durée plus longue avant la mise en production.

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
