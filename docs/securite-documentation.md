# Documentation de sécurité

Référence demandée par l'OWASP ASVS 5.0 niveau 2 : règles de validation, fichiers, autorisations, données, flux, cryptographie, dépendances, fonctions coûteuses et journaux. La liste de contrôle d'un ajout, les mots de passe, la double authentification, les sessions, les limites d'usage et le journal de sécurité sont dans [`securite.md`](securite.md). Toute évolution qui change un de ces points met à jour ce document dans le même commit.

## Règles de validation (V2)

- **Où** : les schémas Zod de `@obsio/shared` (`packages/shared/src/`) sont la seule définition des entrées. Le front les utilise pour ses formulaires, l'API pour chaque route (paramètres, requête, corps, réponse), le worker pour la sortie du modèle Mistral. Une donnée refusée par le schéma ne va pas plus loin (réponse 400, événement `validation-refusee`).
- **Textes** : bornés (nom 200 caractères, description et commentaire 5 000), espaces de tête et de fin retirés. Ils sont affichés comme texte, jamais interprétés comme HTML.
- **Identifiants** : UUID ; un identifiant reçu est relu dans la transaction de l'organisation (`withOrganisation`), donc inexistant pour une autre organisation.
- **Règles combinées**, vérifiées par l'API, et par la base quand c'est possible (contraintes, clés étrangères) :
  - un bâtiment appartient à un site, un étage à un bâtiment, un équipement à un étage, tous de la même organisation ; un élément archivé n'accepte plus de rattachement ;
  - une réserve est rattachée à un équipement du même site, ou à aucun ; sa position sur le plan est comprise entre 0 et 1 (fraction de l'image) ;
  - une réserve extraite par l'IA reste un brouillon tant qu'un admin n'a pas validé l'import ; une réserve n'est levée que par la revue d'un admin ;
  - une échéance est une date ; la périodicité d'une vérification (Code du travail, Q18, Q19) est un nombre de mois entre 1 et 60 ;
  - une assignation d'intervenant dure de 1 à 365 jours (30 par défaut) et ne porte que sur des réserves ouvertes de l'organisation ;
  - une preuve porte au plus 6 photos, envoyées pour cette réserve.

## Fichiers acceptés (V5)

| Fichier | Types (vérifiés par signature) | Taille maximale | Dépôt |
| --- | --- | --- | --- |
| Rapport de vérification | PDF | 50 Mo | Admin |
| Plan d'étage, fichier d'origine | PDF, PNG, JPEG, WebP | 50 Mo | Admin |
| Plan d'étage, image affichée | PNG, JPEG, WebP | 30 Mo | Admin |
| Photo de preuve | JPEG, PNG, WebP | 15 Mo, 6 par preuve | Membre, intervenant |

Dépôt par URL signée valable 10 minutes, qui impose le type et la taille ; clé choisie par le serveur sous `organisations/<id>/`. À la confirmation, l'API vérifie la signature du contenu puis le fait analyser par ClamAV. Lecture par URL signée valable 15 minutes ; les PDF sont téléchargés en pièce jointe. SVG, HTML, archives et documents bureautiques sont refusés.

## Authentification (V6)

Limitation des tentatives, par adresse IP : connexion 10 par 5 minutes, inscription et demande de réinitialisation 5 par heure, réinitialisation 10 par heure, routes de double authentification 3 par 10 secondes, connexion par passkey 10 par 5 minutes ; compte verrouillé 15 minutes après 10 codes TOTP faux de suite. Détails des règles de mot de passe, de double authentification et de session : [`securite.md`](securite.md).

## Matrice des autorisations (V8)

Rôles : **admin**, **responsable** et **collaborateur** d'une organisation (Better Auth, `@obsio/shared/permissions`), **intervenant** par lien signé sans compte, **éditeur** (exploitant d'Obsio) en ligne de commande sur le serveur. Chaque route de l'API porte un garde (`apps/api/src/auth/guards.ts`) ; l'appartenance et le rôle sont relus en base à chaque requête, et la double authentification est exigée.

| Ressource | Collaborateur | Responsable | Admin | Intervenant | Éditeur |
| --- | --- | --- | --- | --- | --- |
| Sites, bâtiments, étages, équipements, plans | Seulement l'étage et les équipements de ses réserves (lecture) | Lecture, création, modification, archivage | Idem | — | — |
| Imports de rapports | — | Dépôt, relecture des brouillons, validation, relance | Idem | — | — |
| Réserves | Lecture, commentaire, photo, preuve (passe à « corrigée »), pour les réserves qui lui sont confiées | Toutes : modification (description, préconisation, gravité, échéance, équipement), revue (levée ou refus) | Idem | Lecture et preuve, pour les réserves de son assignation | — |
| Intervenants et assignations | — | Création, modification, révocation des liens | Idem | — | — |
| Réserves confiées à des collaborateurs | « Mes réserves » (les siennes) | Confier à des personnes de l'organisation, retirer | Idem | — | — |
| Vérifications périodiques | — | Modification | Idem | — | — |
| Tableau de bord, dossier de preuves PDF | — | Oui | Oui | — | — |
| Personnes et invitations | — | Invitation, changement de rôle et retrait des seuls collaborateurs | Tout le monde, sauf l'admin fondateur (ni rétrogradé, ni retiré) | — | — |
| Organisation | — | — | — | — | Création, export, suppression (`pnpm org:*`), réinitialisation de la double authentification |

Au niveau du champ : un collaborateur ne modifie aucun champ d'une réserve, il ajoute seulement commentaires, photos et preuves, et seulement tant qu'elle lui est confiée ; le statut ne change que par une preuve (« corrigée ») ou par la revue d'un admin ou d'un responsable (« levée » ou retour à « ouverte ») et par les assignations (« assignée ») ; seule une personne de l'organisation peut se voir confier une réserve, et ses assignations prennent fin à son retrait ; une route n'est ouverte au collaborateur que si elle le déclare (`config: { collaborator: true }`), sinon 403 ; une réserve hors de sa portée répond 404 ; l'organisation d'une donnée n'est jamais lue dans la requête, toujours dans la session.

## Classification des données (V14)

| Catégorie | Données | Protection |
| --- | --- | --- |
| **Confidentiel client** | Rapports de vérification, réserves, plans, photos de preuve, commentaires, journal des réserves | Cloisonnement par organisation (RLS forcée), accès authentifié avec double authentification, stockage privé et URL signées courtes, sauvegardes de la base sur le serveur, pas de cache navigateur (`no-store`), cache du front vidé à la déconnexion, export et suppression sur demande |
| **Données personnelles** | Membres : nom, adresse e-mail, adresse IP et navigateur des sessions, abonnements aux notifications de leurs appareils. Intervenants : nom, entreprise, adresse e-mail, téléphone | Mêmes protections ; jamais dans les URL ; dans les journaux, seulement l'adresse IP et l'adresse e-mail saisie à la connexion |
| **Secret** | Mots de passe, secrets TOTP et codes de secours, jetons de session, de lien intervenant, d'invitation et de réinitialisation, clés et mots de passe du serveur | Mots de passe hachés (scrypt), secrets TOTP chiffrés, codes de secours hachés, jetons de lien hachés (SHA-256), jamais journalisés ni renvoyés ; secrets du serveur chiffrés par SOPS/age (clé détenue par l'éditeur seul), déposés en fichiers dans un dossier de root et montés par Docker dans les seuls services qui en ont besoin |
| **Interne** | Résultats bruts d'extraction, versions des modèles et du prompt | Stockés à côté du rapport, mêmes protections que les données client |

Données envoyées à des tiers : le rapport PDF à Mistral (France) pour l'extraction, sous ses conditions d'API (pas d'entraînement sur les données des clients payants, à confirmer dans l'accord de traitement) ; les e-mails (adresse, nom, liens) à Brevo (UE) ; les journaux à Better Stack (UE) ; les notifications sur le téléphone au service de notification du navigateur de chaque appareil abonné (Apple, Google, Mozilla, Microsoft, hors UE pour certains), chiffrées de bout en bout pour l'appareil (RFC 8291) : ces services ne voient que l'appareil destinataire et l'heure, et le texte se limite au nom de l'organisation, au site et au nombre de réserves. Durées de conservation : données client jusqu'à la suppression de l'organisation ; sauvegardes 7 jours ; journaux du serveur 5 fichiers de 10 Mo par conteneur ; journaux Better Stack selon l'offre (3 jours en gratuit).

## Flux réseau (V13)

| De | Vers | Protocole | Authentification |
| --- | --- | --- | --- |
| Navigateur | Caddy (application, API) | HTTPS, HSTS | Cookie de session `__Host-` |
| Navigateur | Caddy (stockage) | HTTPS | URL signée |
| Proxy Caddy | web (Caddy), stockage | HTTPS, certificat interne vérifié | — |
| web (Caddy) | API | HTTPS, certificat interne vérifié | Cookie de session transmis |
| API, worker, setup | PostgreSQL | TLS 1.2 au moins exigé (`hostssl`, `sslmode=verify-full`) | Rôle `app_user` (RLS) ; `app_owner` pour setup et les commandes de l'éditeur |
| API, worker | Redis | TLS seulement (port en clair fermé), certificat vérifié | Mot de passe |
| Sauvegarde | PostgreSQL | TLS, `sslmode=verify-full` | Rôle `postgres` |
| API, worker | Stockage (RustFS) | HTTPS par l'adresse publique (proxy), puis HTTPS interne | Compte limité au bucket |
| API | ClamAV | Socket Unix dans un volume partagé avec l'API seule (aucun passage par le réseau) | Droits du fichier (groupe 1000) |
| API | Brevo | SMTP, TLS 1.2 au moins obligatoire | Identifiant SMTP |
| API | Have I Been Pwned | HTTPS | — (5 premiers caractères de l'empreinte seulement) |
| Worker | Mistral | HTTPS | Clé d'API |
| API | Services de notification des navigateurs (`fcm.googleapis.com`, `*.push.apple.com`, `updates.push.services.mozilla.com`, `*.notify.windows.com`) | HTTPS, contenu chiffré pour l'appareil (RFC 8291) | Jeton VAPID signé (RFC 8292) ; adresse d'abonnement refusée hors de ces domaines |
| Vector | Better Stack | HTTPS | Jeton d'ajout seul |

Seuls les ports 80, 443 (Caddy) et 22 (SSH par clé) sont ouverts sur le serveur. Entre les services, tout passe en TLS avec un certificat par service (nom du service sur le réseau Docker), signé par une autorité interne créée par `deploy/secrets.sh` ; les clients vérifient le certificat et son nom, sans repli en clair. ClamAV, qui ne connaît pas TLS, n'écoute que dans son conteneur. En préproduction sur une machine (`deploy/compose.yml` seul), le navigateur joint le front et le stockage en HTTP sur le poste : seul le serveur ajoute le proxy HTTPS devant eux.

## Inventaire cryptographique et gestion des clés (V11)

| Usage | Algorithme | Où |
| --- | --- | --- |
| Transport | TLS 1.2 et 1.3 (Caddy, certificats Let's Encrypt) | `deploy/server/Caddyfile` |
| Transport interne | TLS 1.2 et 1.3, certificats ECDSA P-256 d'une autorité interne, deux ans | `deploy/secrets.sh`, `deploy/compose.yml` |
| Mots de passe | scrypt (Better Auth) | table `account` |
| Jetons de session, signature du cookie | 32 octets aléatoires, HMAC-SHA-256 avec `BETTER_AUTH_SECRET` | Better Auth |
| Secret TOTP | Chiffrement symétrique de Better Auth (XChaCha20-Poly1305), clé dérivée de `BETTER_AUTH_SECRET` | table `two_factor` |
| Codes de secours | 120 bits aléatoires, stockés en SHA-256 | table `two_factor` |
| Codes TOTP | HMAC-SHA-1, 6 chiffres, 30 secondes (RFC 6238) | Better Auth |
| Passkeys | Clé publique WebAuthn (ES256 ou RS256) de l'appareil ; signature d'un défi aléatoire à usage unique | table `passkey` (clé publique seulement) |
| Notifications (Web Push) | Contenu chiffré pour l'appareil (ECDH P-256 et AES-128-GCM, RFC 8291) ; jeton VAPID signé ES256 (RFC 8292) | `apps/api/src/push/push.ts` (bibliothèque `web-push`), table `push_subscription` |
| Liens intervenant | 32 octets aléatoires, stockés en SHA-256 | `apps/api/src/routes/reserves.ts` |
| URL signées du stockage | AWS SigV4 (HMAC-SHA-256) | `apps/api/src/storage.ts` |
| Nombres aléatoires | Générateur cryptographique de Node.js (`crypto.randomBytes`, `crypto.randomUUID`) | — |

Aucun algorithme n'est écrit à la main : ils viennent de Node.js, de Better Auth et du SDK AWS. Changer d'algorithme passe par une mise à jour de ces bibliothèques, en relisant leurs notes de version ; les mots de passe sont rehachés à la connexion quand Better Auth change de paramètres.

Les secrets du serveur sont des fichiers créés par `deploy/secrets.sh` ; l'exemplaire de référence est chiffré par SOPS avec la clé age de l'éditeur. Modifier un secret : `sops edit`, puis `deploy/secrets.sh envoyer` et redémarrer les services concernés.

| Clé ou secret | Création | Rotation | Révocation, compromission |
| --- | --- | --- | --- |
| Clé age de l'éditeur | `age-keygen`, sur son poste, sauvegardée dans un gestionnaire de mots de passe | Au changement de poste ou à la compromission : `sops updatekeys` avec la nouvelle clé publique, puis rotation de tous les secrets | Idem |
| `better_auth_secret` | `deploy/secrets.sh generer` (32 octets aléatoires) | À la compromission seulement : toutes les sessions sont perdues, et les secrets TOTP deviennent illisibles, donc chaque utilisateur réactive sa double authentification (`pnpm user:reset-2fa`) | Remplacer, envoyer, redémarrer |
| Mots de passe PostgreSQL (`app_user`, `app_owner`, `postgres`) | `deploy/secrets.sh generer` (32 octets) | Annuelle et au départ d'une personne ayant eu accès au serveur : `ALTER ROLE … PASSWORD`, puis le secret (`deploy/secrets.sh deriver` recalcule les adresses) | Idem |
| Clés du stockage (principale, application) | `deploy/secrets.sh generer` (16 octets, limite de RustFS) | Annuelle : nouvelle clé d'application créée par setup, puis l'ancienne supprimée | Idem |
| Mot de passe Redis | `deploy/secrets.sh generer` (32 octets) | Annuelle | Remplacer, envoyer, redémarrer |
| `vapid_private_key` (notifications) | `deploy/secrets.sh generer` (clé P-256) | À la compromission seulement : les abonnements existants cessent de fonctionner, chaque appareil réactive les notifications | Remplacer, envoyer, redémarrer, vider la table `push_subscription` |
| Certificats internes (`tls_*`) | `deploy/secrets.sh generer` : autorité interne dont la clé est détruite après signature | Avant expiration (deux ans) : `deploy/secrets.sh certificats` refait l'autorité et tous les certificats, puis envoyer et relancer tous les services | Idem |
| Clé Mistral, mot de passe SMTP Brevo, jeton Better Stack | Console du fournisseur | Annuelle | Révoquer chez le fournisseur |
| Clé SSH du serveur | Sur le poste de l'éditeur, avec phrase de passe | Au changement de poste | Retirer de `authorized_keys` |

## Dépendances (V15)

- **Délais de correction** depuis l'alerte (`pnpm audit`, Dependabot) : critique 48 heures, élevée 7 jours, modérée 30 jours, faible à la mise à jour suivante. Une faille qui ne touche pas Obsio (code non utilisé, outil de développement seulement) peut être écartée, avec la raison dans le commit.
- Mises à jour proposées chaque semaine par Dependabot, après 7 jours de recul ; actions GitHub épinglées par empreinte ; SBOM produit à chaque passage de la CI.
- Composants à surveiller de près, parce qu'ils portent la sécurité : Better Auth, Fastify, Drizzle, le SDK AWS, pdf.js, Caddy, PostgreSQL, ClamAV.

## Fonctions coûteuses (V15)

| Fonction | Coût | Protection |
| --- | --- | --- |
| Analyse d'un rapport (OCR et modèle Mistral) | Appel payant, plusieurs dizaines de secondes | File BullMQ traitée par le worker, 20 par jour et par organisation, réservée aux admins |
| Dossier de preuves PDF | Processeur et mémoire de l'API, photos lues dans le stockage | 30 par heure et par organisation |
| Analyse antivirus | Lecture complète du fichier (50 Mo au plus) | Taille bornée par l'URL signée, une analyse par dépôt confirmé |
| Export d'une organisation | Lecture de toutes ses données et fichiers | Ligne de commande de l'éditeur seulement |
| Vérification Have I Been Pwned | Appel externe | Limité par les règles de débit de l'authentification |

## Inventaire des journaux (V16)

| Journal | Contenu | Où | Conservation |
| --- | --- | --- | --- |
| API | Requêtes (méthode, URL sans jeton, statut, durée), erreurs avec leur détail, événements de sécurité (`securite: true`) | Sortie standard du conteneur, JSON (pino) | Serveur : 5 × 10 Mo ; Better Stack |
| Worker | Extractions (import, durée, erreurs, modèles) | Idem | Idem |
| Caddy, PostgreSQL, Redis, ClamAV, stockage | Journaux propres à chaque service | Sortie standard des conteneurs | Idem |
| Actions sur les réserves | Auteur, date, action, détail | Table `reserve_event`, jamais supprimée (sauf suppression de l'organisation) | Durée de vie de l'organisation |
| Commandes de l'éditeur | Suppression d'organisation (ligne datée), réinitialisation de double authentification | Sortie de la commande, à reporter au registre RGPD | Registre |

Les journaux du serveur se lisent avec `obsio logs` (root seulement) ; la copie de Better Stack se consulte dans son interface. Heures en UTC, au format ISO 8601.
