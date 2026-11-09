# Sécurité — référentiel OWASP

Obsio vise le **niveau 2 de l'OWASP ASVS 5.0** (Application Security Verification Standard), le niveau prévu pour les applications qui traitent des données sensibles : données de conformité réglementaire et données personnelles de plusieurs clients. Les [Cheat Sheets OWASP](https://cheatsheetseries.owasp.org/) servent de guide d'implémentation ; le Top 10 n'est qu'un résumé.

Ce document contient la liste de contrôle à appliquer à chaque ajout, puis l'état de l'audit.

## Liste de contrôle d'un ajout

À relire avant chaque commit qui touche l'API, le worker, le front ou le déploiement. Si un point ne peut pas être respecté, le dire et noter l'écart dans la section « Écarts » ci-dessous plutôt que de le contourner en silence.

**Accès (ASVS V8 Autorisation)**

- Toute route a un garde : `requireUser`, `requireOrganisation` (membre) ou `requireAdmin` (`apps/api/src/auth/guards.ts`), ou le jeton signé d'un lien intervenant. Une route publique est une décision explicite, commentée.
- Les tables métier ne sont lues et écrites que par `withOrganisation()` ; un identifiant reçu du client (site, réserve, fichier) est relu dans cette transaction, jamais utilisé tel quel.
- Un test vérifie le refus pour une autre organisation et, si la route est réservée à l'admin, pour un membre.
- Le lien intervenant ne donne accès qu'aux réserves de son assignation : lecture et ajout de preuves.

**Entrées et sorties (V1 Encodage, V2 Validation, V4 API)**

- Paramètres, requête et corps validés par un schéma Zod ; réponses typées par un schéma.
- Pas de SQL construit par concaténation : requêtes Drizzle ou `sql` paramétré.
- Pas de HTML injecté côté front (`dangerouslySetInnerHTML`, `innerHTML`) ; un texte venu d'un rapport ou d'un utilisateur est affiché comme texte.
- Toute sortie de LLM est validée par un schéma Zod avant d'être utilisée ou stockée.
- Messages d'erreur sans détail interne (pile, requête SQL, chemin).

**Fichiers (V5)**

- Dépôt par URL signée : type de contenu et taille maximale imposés, clé générée par le serveur sous `organisations/<id>/`.
- Type du fichier revérifié côté serveur avant traitement ; nom d'origine jamais utilisé comme chemin.
- Téléchargement par URL signée à courte durée ; le stockage reste privé.

**Authentification et sessions (V6, V7)**

- Passer par Better Auth ; ne pas écrire sa propre gestion de mot de passe, de jeton ou de cookie.
- Toute action sensible (rôle, invitation, suppression, export) relit l'appartenance en base.
- Jetons (liens intervenant, invitations) aléatoires, stockés hachés, à expiration, révocables.

**Données et secrets (V11 Cryptographie, V13 Configuration, V14 Protection des données)**

- Aucun secret dans le dépôt ; nouvelle variable ajoutée à `.env.example` et aux modèles de `deploy/`.
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

## Journal de sécurité

L'API écrit une ligne JSON par événement de sécurité, reconnaissable à `"securite": true` (`apps/api/src/security-log.ts`), avec l'heure, l'adresse IP, la méthode, l'URL sans ses jetons, l'utilisateur et l'organisation quand ils sont connus :

| Événement | Quand |
| --- | --- |
| `authentification` | Connexion, inscription, déconnexion, demande et réinitialisation de mot de passe, changement de mot de passe, vérification d'adresse, fermeture de sessions, invitation, acceptation, retrait de membre, changement de rôle, double authentification : réussite ou échec, avec l'adresse saisie |
| `acces-refuse` | Réponse 401 ou 403 d'une route de l'API |
| `lien-intervention-refuse` | Lien intervenant inconnu, expiré ou révoqué |
| `limite-depassee` | Réponse 429 (limitation de débit) |
| `validation-refusee` | Requête refusée par un schéma (champs en cause, sans leur valeur) |

Jamais de mot de passe, de jeton ni de contenu métier dans le journal. Les actions sur les réserves sont tracées à part, dans `reserve_event`.

## Garde-fous automatiques

Workflow `Sécurité` (`.github/workflows/securite.yml`), à chaque push, sur chaque pull request et chaque lundi :

- **Dépendances** : `pnpm audit`. Échec dès une faille modérée dans les dépendances de production, élevée dans les outils de développement.
- **Secrets** : gitleaks sur tout l'historique. Un faux positif s'ajoute à `.gitleaksignore` par son empreinte, avec un commentaire.
- **Analyse statique** : Semgrep, règles OWASP Top 10, TypeScript, Node.js, React et Dockerfile. Un faux positif se marque sur la ligne par `// nosemgrep: <règle>`, précédé de la raison.

Dependabot (`.github/dependabot.yml`) propose chaque semaine les mises à jour des paquets, des actions GitHub et des images Docker, après 7 jours de recul sur chaque version publiée. Les actions GitHub sont épinglées par empreinte de commit.

Scan ZAP (`.github/workflows/zap.yml`) : scan passif de la préproduction, lancé à la main depuis l'onglet Actions ; rapport en pièce jointe du passage.

Avant d'ajouter un faux positif ou d'écarter une règle, vérifier qu'il ne s'agit pas d'un vrai problème ; l'écart se note ci-dessous.

## Audit ASVS niveau 2

Audit complet du 9 novembre 2026 dans [`securite-audit.md`](securite-audit.md) : statut et constat pour chacune des 253 exigences des niveaux 1 et 2, corrections classées par priorité. Sur 168 exigences applicables : 101 conformes, 32 partielles, 33 à corriger, 2 écarts proposés.

Tenir ce document à jour : une correction change le statut de l'exigence et retire la ligne de la liste des corrections.

## Écarts

Écarts connus et acceptés, avec leur raison et l'échéance de correction.

| Écart | Raison | Échéance |
| --- | --- | --- |
| Serveur de préproduction hors de l'UE | VPS disponible au Canada en attendant l'UE | Avant toute donnée réelle |
| Fichiers du stockage sans sauvegarde, rien hors du serveur | Préproduction, données de test | Avant la bêta |
| Réglages de chaîne d'approvisionnement de pnpm 10 absents (`minimumReleaseAge`, `trustPolicy`, `blockExoticSubdeps`) ; règles Semgrep correspondantes écartées | Le dépôt utilise pnpm 9 ; le passage à pnpm 10 change l'exécution des scripts d'installation | Passage à pnpm 10 |
