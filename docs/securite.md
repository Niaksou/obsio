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

## Audit ASVS niveau 2

À faire : chaque exigence applicable avec son statut (conforme, à corriger, non applicable) et sa preuve (fichier, test ou configuration).

## Écarts

Écarts connus et acceptés, avec leur raison et l'échéance de correction.

| Écart | Raison | Échéance |
| --- | --- | --- |
| Serveur de préproduction hors de l'UE | VPS disponible au Canada en attendant l'UE | Avant toute donnée réelle |
| Fichiers du stockage sans sauvegarde, rien hors du serveur | Préproduction, données de test | Avant la bêta |
