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
exit                          # puis se reconnecter, pour utiliser docker sans sudo
```

Le script installe les mises à jour (puis les mises à jour de sécurité automatiques), Docker, un pare-feu qui n'ouvre que SSH, HTTP et HTTPS, 2 Go de mémoire d'échange, et le dossier des sauvegardes `/var/backups/obsio`.

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
echo "alias obsio='docker compose -f ~/obsio/deploy/compose.yml -f ~/obsio/deploy/compose.server.yml --env-file ~/obsio/deploy/server.env'" >> ~/.bashrc
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

## Au quotidien

| Besoin | Commande |
|---|---|
| Mettre à jour après un `git push` | `cd ~/obsio && git pull && obsio up -d --build --wait` |
| État des services | `obsio ps` |
| Journaux (ici de l'API) | `obsio logs -f --tail 100 api` |
| Arrêter / relancer | `obsio stop` / `obsio up -d --wait` |

Les services redémarrent seuls après un redémarrage du serveur. Les migrations de la base passent à chaque démarrage.

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
