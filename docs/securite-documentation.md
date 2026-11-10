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

Limitation des tentatives, par adresse IP : connexion 10 par 5 minutes, inscription et demande de réinitialisation 5 par heure, réinitialisation 10 par heure, routes de double authentification 3 par 10 secondes ; compte verrouillé 15 minutes après 10 codes TOTP faux de suite. Détails des règles de mot de passe, de double authentification et de session : [`securite.md`](securite.md).

## Matrice des autorisations (V8)

Rôles : **admin** et **membre** d'une organisation (Better Auth, `@obsio/shared/permissions`), **intervenant** par lien signé sans compte, **éditeur** (exploitant d'Obsio) en ligne de commande sur le serveur. Chaque route de l'API porte un garde (`apps/api/src/auth/guards.ts`) ; l'appartenance et le rôle sont relus en base à chaque requête, et la double authentification est exigée.

| Ressource | Membre | Admin | Intervenant | Éditeur |
| --- | --- | --- | --- | --- |
| Sites, bâtiments, étages, équipements, plans | Lecture | Lecture, création, modification, archivage | — | — |
| Imports de rapports | Lecture | Dépôt, relecture des brouillons, validation, relance | — | — |
| Réserves | Lecture, commentaire, photo, preuve (passe à « corrigée ») | En plus : modification (description, préconisation, gravité, échéance, équipement), revue (levée ou refus) | Lecture et preuve, pour les réserves de son assignation | — |
| Intervenants et assignations | Lecture | Création, modification, révocation des liens | — | — |
| Vérifications périodiques | Lecture | Modification | — | — |
| Tableau de bord, dossier de preuves PDF | Oui | Oui | — | — |
| Membres et invitations | Lecture | Invitation, changement de rôle, retrait | — | — |
| Organisation | — | — | — | Création, export, suppression (`pnpm org:*`), réinitialisation de la double authentification |

Au niveau du champ : un membre ne modifie aucun champ d'une réserve, il ajoute seulement commentaires, photos et preuves ; le statut ne change que par une preuve (« corrigée ») ou par la revue d'un admin (« levée » ou retour à « ouverte ») ; l'organisation d'une donnée n'est jamais lue dans la requête, toujours dans la session.

## Classification des données (V14)

| Catégorie | Données | Protection |
| --- | --- | --- |
| **Confidentiel client** | Rapports de vérification, réserves, plans, photos de preuve, commentaires, journal des réserves | Cloisonnement par organisation (RLS forcée), accès authentifié avec double authentification, stockage privé et URL signées courtes, sauvegardes de la base sur le serveur, pas de cache navigateur (`no-store`), cache du front vidé à la déconnexion, export et suppression sur demande |
| **Données personnelles** | Membres : nom, adresse e-mail, adresse IP et navigateur des sessions. Intervenants : nom, entreprise, adresse e-mail, téléphone | Mêmes protections ; jamais dans les URL ; dans les journaux, seulement l'adresse IP et l'adresse e-mail saisie à la connexion |
| **Secret** | Mots de passe, secrets TOTP et codes de secours, jetons de session, de lien intervenant, d'invitation et de réinitialisation, clés et mots de passe du serveur | Mots de passe hachés (scrypt), secrets TOTP chiffrés, codes de secours hachés, jetons de lien hachés (SHA-256), jamais journalisés ni renvoyés ; secrets du serveur chiffrés par SOPS/age (clé détenue par l'éditeur seul), déposés en fichiers dans un dossier de root et montés par Docker dans les seuls services qui en ont besoin |
| **Interne** | Résultats bruts d'extraction, versions des modèles et du prompt | Stockés à côté du rapport, mêmes protections que les données client |

Données envoyées à des tiers : le rapport PDF à Mistral (France) pour l'extraction, sous ses conditions d'API (pas d'entraînement sur les données des clients payants, à confirmer dans l'accord de traitement) ; les e-mails (adresse, nom, liens) à Brevo (UE) ; les journaux à Better Stack (UE). Durées de conservation : données client jusqu'à la suppression de l'organisation ; sauvegardes 7 jours ; journaux du serveur 5 fichiers de 10 Mo par conteneur ; journaux Better Stack selon l'offre (3 jours en gratuit).

## Flux réseau (V13)

| De | Vers | Protocole | Authentification |
| --- | --- | --- | --- |
| Navigateur | Caddy (application, API) | HTTPS, HSTS | Cookie de session `__Host-` |
| Navigateur | Caddy (stockage) | HTTPS | URL signée |
| Caddy | web, API, stockage | HTTP, réseau Docker interne | — |
| API, worker | PostgreSQL | Réseau Docker interne | Rôle `app_user` (RLS) ; `app_owner` pour setup et les commandes de l'éditeur |
| API, worker | Redis | Réseau Docker interne | Mot de passe |
| API, worker | Stockage (RustFS) | HTTPS par l'adresse publique, puis interne | Compte limité au bucket |
| API | ClamAV | TCP, réseau Docker interne | — (non exposé) |
| API | Brevo | SMTP, TLS 1.2 au moins obligatoire | Identifiant SMTP |
| API | Have I Been Pwned | HTTPS | — (5 premiers caractères de l'empreinte seulement) |
| Worker | Mistral | HTTPS | Clé d'API |
| Vector | Better Stack | HTTPS | Jeton d'ajout seul |

Seuls les ports 80, 443 (Caddy) et 22 (SSH par clé) sont ouverts sur le serveur. Le chiffrement des flux internes est traité à part (écart 12.3.3).

## Inventaire cryptographique et gestion des clés (V11)

| Usage | Algorithme | Où |
| --- | --- | --- |
| Transport | TLS 1.2 et 1.3 (Caddy, certificats Let's Encrypt) | `deploy/server/Caddyfile` |
| Mots de passe | scrypt (Better Auth) | table `account` |
| Jetons de session, signature du cookie | 32 octets aléatoires, HMAC-SHA-256 avec `BETTER_AUTH_SECRET` | Better Auth |
| Secret TOTP | Chiffrement symétrique de Better Auth (XChaCha20-Poly1305), clé dérivée de `BETTER_AUTH_SECRET` | table `two_factor` |
| Codes de secours | 120 bits aléatoires, stockés en SHA-256 | table `two_factor` |
| Codes TOTP | HMAC-SHA-1, 6 chiffres, 30 secondes (RFC 6238) | Better Auth |
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
