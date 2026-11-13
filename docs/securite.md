# Sécurité — référentiel OWASP

Obsio vise le **niveau 2 de l'OWASP ASVS 5.0** (Application Security Verification Standard), le niveau prévu pour les applications qui traitent des données sensibles : données de conformité réglementaire et données personnelles de plusieurs clients. Les [Cheat Sheets OWASP](https://cheatsheetseries.owasp.org/) servent de guide d'implémentation ; le Top 10 n'est qu'un résumé.

Ce document contient la liste de contrôle à appliquer à chaque ajout, puis l'état de l'audit. Règles de validation, fichiers acceptés, matrice des autorisations, classification des données, flux réseau, cryptographie, dépendances et journaux : [`securite-documentation.md`](securite-documentation.md).

## Liste de contrôle d'un ajout

À relire avant chaque commit qui touche l'API, le worker, le front ou le déploiement. Si un point ne peut pas être respecté, le dire et noter l'écart dans la section « Écarts » ci-dessous plutôt que de le contourner en silence.

**Accès (ASVS V8 Autorisation)**

- Toute route a un garde : `requireUser`, `requireOrganisation` (membre ; refuse le collaborateur sauf route déclarée `config: { collaborator: true }`) ou `requireManager` (admin ou responsable) (`apps/api/src/auth/guards.ts`), ou le jeton signé d'un lien intervenant. Une route publique est une décision explicite, commentée.
- Les tables métier ne sont lues et écrites que par `withOrganisation()` ; un identifiant reçu du client (site, réserve, fichier) est relu dans cette transaction, jamais utilisé tel quel.
- Un test vérifie le refus pour une autre organisation et, si la route est réservée aux admins et responsables, pour un collaborateur ; une route ouverte au collaborateur filtre ce qu'elle renvoie à ses réserves.
- Le lien intervenant ne donne accès qu'aux réserves de son assignation : lecture et ajout de preuves.

**Entrées et sorties (V1 Encodage, V2 Validation, V4 API)**

- Paramètres, requête et corps validés par un schéma Zod ; réponses typées par un schéma.
- Pas de SQL construit par concaténation : requêtes Drizzle ou `sql` paramétré.
- Pas de HTML injecté côté front (`dangerouslySetInnerHTML`, `innerHTML`) ; un texte venu d'un rapport ou d'un utilisateur est affiché comme texte.
- Toute sortie de LLM est validée par un schéma Zod avant d'être utilisée ou stockée.
- Messages d'erreur sans détail interne (pile, requête SQL, chemin).

**Fichiers (V5)**

- Dépôt par URL signée : type de contenu et taille maximale imposés, clé générée par le serveur sous `organisations/<id>/`.
- Type du fichier revérifié côté serveur avant traitement, puis analyse antivirus (ClamAV) : un fichier infecté est supprimé, refusé (422) et journalisé (`fichier-infecte`). Toute vérification d'un dépôt passe par `verifiedContentType` (`apps/api/src/file-signature.ts`). Nom d'origine jamais utilisé comme chemin.
- Téléchargement par URL signée à courte durée ; le stockage reste privé.

**Authentification et sessions (V6, V7)**

- Passer par Better Auth ; ne pas écrire sa propre gestion de mot de passe, de jeton ou de cookie.
- Toute action sensible (rôle, invitation, suppression, export) relit l'appartenance en base.
- Jetons (liens intervenant, invitations) aléatoires, stockés hachés, à expiration, révocables.

**Données et secrets (V11 Cryptographie, V13 Configuration, V14 Protection des données)**

- Aucun secret dans le dépôt ; nouvelle variable ajoutée à `.env.example` et aux modèles de `deploy/`. En déploiement, un nouveau secret est un secret Docker (`deploy/secrets.sh`, lu par `NOM_FILE`), jamais une variable du fichier d'environnement.
- Pas de donnée personnelle ni de secret dans les journaux, les URL ou les messages d'erreur.
- Nouvelle table portant `organisation_id` : RLS forcée (voir `CLAUDE.md`) et entrée dans `ORGANISATION_TABLES` pour l'export et la suppression.
- Pas de suppression physique des réserves, preuves et événements d'audit (seule exception : suppression d'une organisation entière).

**Journalisation (V16)**

- Les actions métier sur une réserve sont tracées dans `reserve_event` (auteur, date, détail).
- Les échecs d'autorisation et les erreurs sont journalisés, sans donnée personnelle.

**Dépendances et déploiement (V13, V15)**

- Nouvelle dépendance : maintenue, téléchargée largement, sans vulnérabilité connue (`pnpm audit`) ; préférer ce qui existe déjà dans le dépôt.
- Nouvel en-tête, nouvelle origine (stockage, API externe) : CSP et en-têtes de `deploy/Caddyfile` mis à jour, sans élargir au-delà du nécessaire.
- Conteneurs : utilisateur non root, système de fichiers en lecture seule, aucun port exposé inutilement.

## Mots de passe

- 12 caractères minimum, 128 maximum, aucune règle de composition, collage et gestionnaires de mots de passe permis ; pas de renouvellement périodique imposé.
- Refusés à l'inscription, à la réinitialisation et au changement :
  - les mots de passe connus des fuites de données (Have I Been Pwned) : seuls les 5 premiers caractères de l'empreinte SHA-1 sont envoyés à `api.pwnedpasswords.com` ; si le service est injoignable, l'opération est refusée et peut être retentée ;
  - les mots propres au contexte, même avec accents, majuscules ou séparateurs : `obsio`, `motdepasse`, `password`, `azerty`, `qwerty`, `electricite`, `electrique`, `electricien`, `verification`, `conformite`, `reserve`, `apsad`, ainsi que le nom de l'utilisateur et la partie locale de son adresse e-mail (`apps/api/src/auth/password-policy.ts`).

## Double authentification

- **Obligatoire pour tous les comptes** (les intervenants, qui passent par un lien sans compte, ne sont pas concernés). Tant qu'elle n'est pas activée, la session ne sert qu'à la configurer : l'API répond 403 et les routes de Better Auth (organisation, invitations, sessions, mot de passe) refusent avec `TWO_FACTOR_REQUIRED` (`apps/api/src/auth/two-factor.ts`).
- Application d'authentification (TOTP, 6 chiffres, 30 secondes) : activation après confirmation du mot de passe, QR code ou clé à saisir, codes de secours, puis premier code. Secret chiffré en base avec `BETTER_AUTH_SECRET`.
- 10 codes de secours à usage unique (24 caractères, 120 bits), stockés hachés, affichés une seule fois à l'activation ; de nouveaux codes, qui remplacent les anciens, se génèrent sur la page « Mon compte » avec le mot de passe.
- Un code TOTP accepté ne sert qu'une fois, même pendant sa validité. Compte verrouillé 15 minutes après 10 codes faux de suite.
- Ni désactivation, ni appareil de confiance qui dispenserait du code.
- Téléphone et codes de secours perdus : `pnpm user:reset-2fa <e-mail>` par l'éditeur, **après vérification de l'identité du demandeur auprès de l'admin de son organisation, par un autre canal que l'e-mail** (téléphone). Le secret et les passkeys sont supprimés et les sessions fermées ; le mot de passe reste exigé pour en configurer un nouveau.

## Passkeys (clés d’accès)

- Connexion sans mot de passe ni TOTP par une passkey WebAuthn (plugin passkey de Better Auth, `apps/api/src/auth/passkey.ts`). L'appareil (clé privée qui ne le quitte pas) et la vérification de l'utilisateur (biométrie ou code de l'appareil) font deux facteurs résistants au hameçonnage (ASVS 6.6, 6.7).
- Ajout seulement depuis une session déjà protégée par la double authentification (sinon `TWO_FACTOR_REQUIRED`) ; le TOTP reste obligatoire et sert de solution de secours.
- Vérification de l'utilisateur exigée à l'ajout et à chaque connexion (indicateur UV de l'authentificateur, refus `PASSKEY_USER_VERIFICATION_REQUIRED`) ; passkey liée au domaine du front (`rpID`), réponse vérifiée contre l'origine exacte de `WEB_URL`, jamais contre l'en-tête `Origin` ; défi à usage unique valable 5 minutes ; compteur de signatures mis à jour.
- Seule la clé publique est stockée (table `passkey`, sans `organisation_id`, comme les autres tables de Better Auth). Liste et retrait sur la page « Mon compte » ; ajout, retrait et connexion journalisés.
- 10 essais de connexion par passkey par 5 minutes et par adresse IP. WebAuthn exige HTTPS (ou `localhost`) : pas de passkey en `pnpm dev:lan` depuis un téléphone.

## Notifications sur le téléphone (Web Push)

- Envoyées par l'API au service de notification du navigateur de chaque appareil abonné, en plus de l'e-mail, quand une réserve est confiée à un collaborateur (`apps/api/src/push/push.ts`).
- Contenu chiffré pour l'appareil (RFC 8291) et jeton VAPID signé (RFC 8292) : le service (Apple, Google, Mozilla, Microsoft) ne voit que le destinataire et l'heure. Texte réduit au nom de l'organisation, au site et au nombre de réserves, sans le texte des réserves (lisible sur un écran verrouillé). Le toucher n'ouvre qu'un chemin de l'application.
- Adresse d'abonnement acceptée seulement en HTTPS vers ces services connus (liste dans le code) : l'API n'envoie jamais de requête vers une adresse choisie par l'utilisateur (pas de SSRF, ASVS 1.3.6).
- Abonnement propre à un compte et à un appareil (table `push_subscription`, sans `organisation_id`), 10 au plus par compte ; retiré à la désactivation, à la déconnexion, quand le service le dit expiré, et avec le compte. Clé privée VAPID en secret Docker (`vapid_private_key`).
- Autorisation demandée seulement après un clic. Sur iPhone, Apple ne permet les notifications qu'à l'application ajoutée à l'écran d'accueil.

## Sessions

- Reconnexion après **2 heures sans activité** ; la session est prolongée au plus toutes les 5 minutes d'usage (`apps/api/src/auth/auth.ts`).
- **Durée maximale de 12 heures** après la connexion, quelle que soit l'activité, imposée par la base (déclencheur de la migration `0007_session_lifetime`). Raison : un technicien se reconnecte au plus une fois par journée de travail, et une session volée ne sert pas au-delà.
- Sessions parallèles permises (poste et téléphone), sans limite de nombre : chacune est visible et peut être fermée par l'utilisateur sur la page « Mon compte ». Toutes sont fermées à la réinitialisation du mot de passe, et quand un admin retire le membre de l'organisation.
- Jeton de session aléatoire, signé, dans un cookie `__Host-obsio.session_token` (`HttpOnly`, `Secure`, `SameSite=Lax`, sans domaine) ; session vérifiée en base à chaque requête et supprimée à la déconnexion.

## Console Obsio (équipe de l'éditeur)

- Réservée aux comptes de l'équipe Obsio (`staff_member`), attribués seulement par `pnpm staff:grant` avec le rôle propriétaire de la base : l'application (`app_user`) n'a pas le droit d'écrire dans cette table, une faille ne peut donc pas créer de compte de l'équipe.
- Pour un autre compte, les routes `/api/console/*` répondent 404 : la console n'existe pas pour lui.
- Déverrouillage par une connexion par clé d'accès (deux facteurs résistants au hameçonnage, ASVS 6.6), jamais par mot de passe et code ; reverrouillage après 15 minutes sans activité (`session.console_until`).
- Chaque action est inscrite dans `console_audit`, en ajout seul (`UPDATE` et `DELETE` retirés à `app_user`).
- La console ne lit que des métadonnées et des compteurs, organisation par organisation, sous la RLS (`withOrganisation`) : jamais le contenu d'un client (réserves, rapports, plans, photos).
- Pages vues (`page_view`, sous RLS) : compteur par organisation, jour et modèle de page pris dans une liste fermée (`PAGE_PATTERNS`), sans donnée personnelle ni cookie : aucun consentement à demander, et le nombre de lignes reste borné.
- Licence d'un client (`licence`, sous RLS) : vérifiée côté serveur à chaque requête qui modifie ses données (`requireOrganisation`), à chaque invitation (crochet `beforeCreateInvitation` de Better Auth) et à chaque preuve déposée par lien intervenant ; les plafonds (sites, utilisateurs, analyses du mois) sont contrôlés dans la transaction de l'ajout. Le bandeau de l'application n'est qu'une information.

## Limites d'usage

| Limite | Valeur | Où |
| --- | --- | --- |
| Requêtes à l'API, par adresse IP | 600 par minute | `apps/api/src/app.ts` |
| Requêtes d'un lien intervenant, par adresse IP | 60 par minute | `apps/api/src/routes/intervention.ts` |
| Connexion, inscription, mot de passe, par adresse IP | Règles strictes de Better Auth | `apps/api/src/auth/auth.ts` |
| Analyses de rapport (dépôt ou relance, appel à Mistral), par organisation | 20 par jour | `apps/api/src/quotas.ts` |
| Dossiers de preuves en PDF, par organisation | 30 par heure | `apps/api/src/quotas.ts` |
| Sites actifs, utilisateurs, analyses de rapport par mois, par organisation | Plafonds de la licence (facultatifs) | `apps/api/src/licences/licence.ts` |
| Taille d'un rapport PDF, d'une photo, d'un plan | Imposée par l'URL signée de dépôt | `packages/shared` |

Un quota d'organisation court sur une fenêtre fixe ouverte par la première opération ; une fois atteint, la réponse 429 donne le délai d'attente et l'événement `limite-depassee` est journalisé. Le refus ne consomme rien. Si Redis est injoignable, la limitation de débit et les quotas refusent toute requête (réponse 500 en une seconde au plus), sauf `/health` qui signale la panne. L'export d'une organisation passe par la ligne de commande de l'éditeur, sans route web.

## Journal de sécurité

L'API écrit une ligne JSON par événement de sécurité, reconnaissable à `"securite": true` (`apps/api/src/security-log.ts`), avec l'heure, l'adresse IP, la méthode, l'URL sans ses jetons, l'utilisateur et l'organisation quand ils sont connus :

| Événement | Quand |
| --- | --- |
| `authentification` | Connexion, inscription, déconnexion, demande et réinitialisation de mot de passe, changement de mot de passe, vérification d'adresse, fermeture de sessions, invitation, acceptation, retrait de membre, changement de rôle, double authentification, connexion, ajout et retrait de passkey : réussite ou échec, avec l'adresse saisie |
| `acces-refuse` | Réponse 401 ou 403 d'une route de l'API |
| `lien-intervention-refuse` | Lien intervenant inconnu, expiré ou révoqué |
| `limite-depassee` | Réponse 429 (limitation de débit) |
| `validation-refusee` | Requête refusée par un schéma (champs en cause, sans leur valeur) |
| `fichier-infecte` | Fichier déposé refusé par l'antivirus (nom de la signature) |

Une copie de tous les journaux part vers Better Stack (UE) par le service `journaux` du serveur (`deploy/server/vector.yaml`) : hors du serveur, et non modifiable depuis lui, le jeton ne permettant que l'ajout.

Jamais de mot de passe, de jeton ni de contenu métier dans le journal. Les actions sur les réserves sont tracées à part, dans `reserve_event`.

## Garde-fous automatiques

Workflow `Sécurité` (`.github/workflows/securite.yml`), à chaque push, sur chaque pull request et chaque lundi :

- **Dépendances** : `pnpm audit`. Échec dès une faille modérée dans les dépendances de production, élevée dans les outils de développement.
- **Secrets** : gitleaks sur tout l'historique. Un faux positif s'ajoute à `.gitleaksignore` par son empreinte, avec un commentaire ; une valeur fictive répétée (mot de passe des tests) s'ajoute aux `stopwords` de `.gitleaks.toml`, qui garde les règles par défaut.
- **Analyse statique** : Semgrep, règles OWASP Top 10, TypeScript, Node.js, React et Dockerfile. Un faux positif se marque sur la ligne par `// nosemgrep: <règle>`, précédé de la raison.
- **Inventaire des composants** : SBOM CycloneDX produit par Syft à partir de `pnpm-lock.yaml`, en pièce jointe de chaque passage (90 jours).

Dependabot (`.github/dependabot.yml`) propose chaque semaine les mises à jour des paquets, des actions GitHub et des images Docker, après 7 jours de recul sur chaque version publiée. Les actions GitHub sont épinglées par empreinte de commit.

Scan ZAP (`.github/workflows/zap.yml`) : scan passif de la préproduction, lancé à la main depuis l'onglet Actions ; rapport en pièce jointe du passage.

Avant d'ajouter un faux positif ou d'écarter une règle, vérifier qu'il ne s'agit pas d'un vrai problème ; l'écart se note ci-dessous.

## Audit ASVS niveau 2

Audit complet du 9 novembre 2026 dans [`securite-audit.md`](securite-audit.md) : statut et constat pour chacune des 253 exigences des niveaux 1 et 2, corrections classées par priorité. Sur 175 exigences applicables, à ce jour : 173 conformes, 2 partielles (13.2.4 et 13.2.5 : flux sortants du serveur), aucune à corriger, aucun écart proposé.

Tenir ce document à jour : une correction change le statut de l'exigence et retire la ligne de la liste des corrections.

## Écarts

Écarts connus et acceptés, avec leur raison et l'échéance de correction.

| Écart | Raison | Échéance |
| --- | --- | --- |
| Serveur de préproduction hors de l'UE | VPS disponible au Canada en attendant l'UE | Avant toute donnée réelle |
| Fichiers du stockage sans sauvegarde, rien hors du serveur | Préproduction, données de test | Avant la bêta |
| Réglages de chaîne d'approvisionnement de pnpm 10 absents (`minimumReleaseAge`, `trustPolicy`, `blockExoticSubdeps`) ; règles Semgrep correspondantes écartées | Le dépôt utilise pnpm 9 ; le passage à pnpm 10 change l'exécution des scripts d'installation | Passage à pnpm 10 |
