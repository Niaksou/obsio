# Audit OWASP ASVS 5.0 — niveau 2

Audit du 9 novembre 2026, sur le commit `50eb477` : code, configuration de déploiement (`deploy/`) et comportement vérifié par des essais locaux. Référentiel : [OWASP ASVS 5.0.0](https://github.com/OWASP/ASVS/releases/tag/v5.0.0_release), exigences des niveaux 1 et 2. Aucune correction n'a été faite pendant l'audit.

Statuts : **Conforme** ; **Partiel** (en partie respecté, ou respecté sans la documentation demandée) ; **À corriger** ; **Écart proposé** (non respecté, à accepter explicitement avec sa raison) ; **N/A** (fonction absente d'Obsio).

## Synthèse

| Statut | Exigences |
| --- | --- |
| Conforme | 137 |
| Partiel | 20 |
| À corriger | 15 |
| Écart proposé | 2 |
| N/A | 79 |
| **Total (niveaux 1 et 2)** | **253** |

Points forts : cloisonnement par la base (RLS forcée et testée), validation Zod de toutes les entrées et sorties, autorisations vérifiées par l'API et la base, liens intervenant hachés et limités, en-têtes de sécurité et CSP sur l'application, TLS et HSTS, outils de sécurité dans la CI.

Les écarts se concentrent sur quatre sujets : l'authentification (double authentification, mots de passe compromis, gestion du compte), la journalisation de sécurité, les fuites d'information (erreurs, jetons dans les journaux) et la documentation de sécurité demandée par le niveau 2.

## Corrections proposées, par priorité

Chaque ligne deviendra un commit ; les exigences concernées sont entre parenthèses.

**Priorité 1 : avant toute donnée réelle**

1. **Fait.** Erreurs internes renvoyées au navigateur : gestionnaire d'erreurs qui renvoie un message générique et journalise le détail (16.5.1).
2. **Fait.** Jetons dans les journaux : masquer le jeton du lien intervenant et ceux de réinitialisation et de vérification d'e-mail dans les URL journalisées (14.2.1, 16.2.5).
3. **Fait.** `Cache-Control: no-store` sur les réponses de l'API, cache du front vidé à la déconnexion (14.3.1, 14.3.2).
4. **Fait.** Vérification du contenu des fichiers déposés (signature PDF, PNG, JPEG, WebP) avant tout traitement (5.2.2).
5. **Fait.** En-têtes du stockage : CSP `sandbox` avec `frame-ancestors 'none'`, et téléchargement des PDF en pièce jointe (3.2.1, 3.4.3, 3.4.6, 5.4.1).
6. **Fait.** Moindre privilège : le rôle propriétaire de la base et la clé principale du stockage seulement pour la migration et les commandes de l'éditeur ; un compte de stockage dédié à l'application ; mot de passe Redis (13.2.1, 13.2.2, 13.3.2).

**Priorité 2 : avant la bêta**

7. **Fait.** Double authentification par application (TOTP, plugin `twoFactor` de Better Auth), obligatoire au moins pour les administrateurs (6.3.3, 6.4.3).
8. **Fait.** Mots de passe compromis et courants refusés (plugin `haveIBeenPwned` de Better Auth, qui n'envoie qu'un début d'empreinte), avec une liste de mots propres à Obsio et à l'organisation (6.1.2, 6.2.4, 6.2.11, 6.2.12).
9. Page « Mon compte » : changer son mot de passe, voir et fermer ses sessions (6.2.2, 6.2.3, 7.4.3, 7.5.2).
10. Sessions : durée maximale absolue et délai d'inactivité décidés et documentés ; l'admin ferme les sessions d'un membre qu'il retire (7.1.1, 7.1.2, 7.3.1, 7.3.2, 7.4.5).
11. **Fait.** Journalisation de sécurité : connexions réussies et échouées, refus d'accès avec l'utilisateur, échecs de validation, opérations de l'éditeur (16.2.1, 16.3.1 à 16.3.4).
12. **Fait.** Quotas par organisation : imports et extractions par jour, dossiers PDF et exports (2.1.3, 2.3.2, 2.4.1, 15.2.2).

**Priorité 3 : consolidation**

13. Documentation de sécurité dans `docs/securite.md` : règles de validation et limites, fichiers acceptés, matrice des autorisations, classification des données, flux réseau, inventaire cryptographique et gestion des clés, délais de correction des dépendances, fonctions coûteuses, inventaire des journaux (2.1.1, 2.1.2, 5.1.1, 6.1.1, 8.1.1, 8.1.2, 11.1.1, 11.1.2, 11.2.2, 13.1.1, 14.1.1, 14.1.2, 14.2.4, 15.1.1, 15.1.3, 16.1.1, 16.2.3).
14. Journaux envoyés hors du serveur et non modifiables (16.4.2, 16.4.3).
15. Antivirus sur les fichiers déposés (ClamAV dans le worker), ou écart accepté vu les types restreints et le stockage séparé (5.4.3).
16. SMTP avec TLS obligatoire (`requireTLS`) (12.3.1).
17. Cookie de session avec le préfixe `__Host-` (3.3.3).
18. Limitation de débit qui refuse au lieu de laisser passer quand Redis est indisponible, au moins pour l'authentification (16.5.3).
19. SBOM produit par la CI (15.1.2) ; passage à pnpm 10 (écart déjà noté).
20. `/api` en HTTP : refus plutôt que redirection (4.1.2).

## Écarts proposés

À accepter ou non ; s'ils le sont, ils rejoignent la table des écarts de `docs/securite.md`.

- **Communications internes en clair** (12.3.3) : PostgreSQL, Redis et le stockage communiquent sur le réseau Docker interne d'un seul serveur, sans port exposé. Le chiffrement deviendra nécessaire si les services sont répartis sur plusieurs machines.
- **Pas de coffre-fort de secrets** (13.3.1) : les secrets sont dans `deploy/server.env`, lisible par root seulement. Un coffre-fort (Vault, gestionnaire de l'hébergeur) est disproportionné pour un seul serveur ; à revoir avec la mise en production.

## Détail par exigence

### V1 — Encodage et assainissement

| Exigence | Niv. | Statut | Constat |
| --- | --- | --- | --- |
| V1.1.1 | 2 | Conforme | Décodage par Fastify (JSON, URL) une seule fois, avant la validation Zod. |
| V1.1.2 | 2 | Conforme | Échappement au dernier moment : React au rendu, Drizzle à la requête, `escapeHtml` dans les e-mails, neutralisation des formules à l’écriture du CSV. |
| V1.2.1 | 1 | Conforme | React échappe le texte ; e-mails HTML échappés (`email/templates.ts`). |
| V1.2.2 | 1 | Conforme | URL construites par le serveur (liens signés, liens d’e-mail) à partir d’identifiants générés ; aucun lien construit depuis une saisie. |
| V1.2.3 | 1 | Conforme | JSON produit par `JSON.stringify` et le sérialiseur Fastify. |
| V1.2.4 | 1 | Conforme | Drizzle et `sql` paramétré ; aucun `sql.raw`. |
| V1.2.5 | 1 | N/A | Aucun appel au système (`child_process` absent). |
| V1.2.6 | 2 | N/A | Pas d’annuaire LDAP. |
| V1.2.7 | 2 | N/A | Pas de XPath. |
| V1.2.8 | 2 | N/A | Pas de LaTeX. |
| V1.2.9 | 2 | Conforme | Aucune expression régulière construite depuis une saisie. |
| V1.3.1 | 1 | N/A | Pas d’éditeur HTML. |
| V1.3.2 | 1 | Conforme | Ni `eval` ni `new Function` ; CSP sans `unsafe-eval` (seulement `wasm-unsafe-eval` pour pdf.js). |
| V1.3.3 | 2 | Conforme | Textes passés à pdfkit, formules neutralisées dans le CSV, noms de fichiers de l’export nettoyés. |
| V1.3.4 | 2 | Conforme | SVG refusé à l’envoi : seuls PDF, PNG, JPEG et WebP sont acceptés. |
| V1.3.5 | 2 | N/A | Ni Markdown ni CSS fournis par l’utilisateur. |
| V1.3.6 | 2 | Conforme | Aucune requête sortante vers une adresse fournie par l’utilisateur ; le PDF part chez Mistral dans le corps de la requête. |
| V1.3.7 | 2 | Conforme | Modèles d’e-mail écrits dans le code. |
| V1.3.8 | 2 | N/A | Pas de JNDI. |
| V1.3.9 | 2 | N/A | Pas de memcache. |
| V1.3.10 | 2 | Conforme | Journaux structurés (pino), pas de chaîne de format alimentée par une saisie. |
| V1.3.11 | 2 | Conforme | nodemailer encode les en-têtes ; adresses validées par Zod. |
| V1.4.1 | 2 | N/A | TypeScript sur Node.js, mémoire gérée. |
| V1.4.2 | 2 | N/A | Idem ; bornes numériques validées par Zod. |
| V1.4.3 | 2 | N/A | Idem. |
| V1.5.1 | 1 | N/A | Aucun analyseur XML. |
| V1.5.2 | 2 | Conforme | `JSON.parse` puis schéma Zod ; le parseur de Fastify rejette `__proto__`. |

### V2 — Validation et logique métier

| Exigence | Niv. | Statut | Constat |
| --- | --- | --- | --- |
| V2.1.1 | 1 | Partiel | Les règles sont les schémas Zod de `@obsio/shared`, partagés par le front et l’API ; aucun document ne les présente. |
| V2.1.2 | 2 | Partiel | Règles combinées (position sur le plan, périodicité, rattachements) dans le code et la base, non documentées. |
| V2.1.3 | 2 | Conforme | Limites d’usage documentées dans `docs/securite.md` : débit par adresse IP, quotas par organisation, tailles de fichier. |
| V2.2.1 | 1 | Conforme | Énumérations, formats et bornes Zod. |
| V2.2.2 | 1 | Conforme | Validation côté API et contraintes en base (`check`, clés étrangères composites). |
| V2.2.3 | 2 | Conforme | Contrôles croisés en code et en base (`equipment_position`, périodicité de 1 à 60 mois, paires identifiant et organisation). |
| V2.3.1 | 1 | Conforme | Transitions contrôlées par le serveur : import en analyse, à valider puis validé ; revue seulement d’une réserve corrigée ; réserve levée non modifiable. |
| V2.3.2 | 2 | Conforme | Quotas par organisation dans Redis : 20 analyses de rapport par jour, 30 dossiers PDF par heure (`apps/api/src/quotas.ts`). |
| V2.3.3 | 2 | Conforme | Chaque opération dans une transaction (`withOrganisation`). |
| V2.3.4 | 2 | Conforme | Validation d’un import sous verrou (`select … for update`). |
| V2.4.1 | 2 | Conforme | Limitation par adresse IP (600/min pour l’API, 60/min pour les liens intervenant, règles strictes sur l’authentification) et quotas par organisation sur les opérations coûteuses (analyse Mistral, dossier PDF), refus si Redis est injoignable. |

### V3 — Sécurité du front

| Exigence | Niv. | Statut | Constat |
| --- | --- | --- | --- |
| V3.2.1 | 1 | Conforme | API en JSON avec `nosniff` ; fichiers des utilisateurs sur un autre nom d’hôte, contenu vérifié (5.2.2), servis avec `CSP: sandbox`, PDF en pièce jointe. |
| V3.2.2 | 1 | Conforme | Rendu React en texte ; ni `dangerouslySetInnerHTML` ni `innerHTML`. |
| V3.3.1 | 1 | Conforme | Better Auth pose `Secure` et le préfixe `__Secure-` dès que l’URL est en HTTPS. |
| V3.3.2 | 2 | Conforme | `SameSite=Lax` (défaut de Better Auth). |
| V3.3.3 | 2 | À corriger | Préfixe `__Secure-` et non `__Host-`. |
| V3.3.4 | 2 | Conforme | Cookie de session `HttpOnly`, jamais lu par le JavaScript. |
| V3.4.1 | 1 | Conforme | HSTS d’un an avec `includeSubDomains`, sur l’application et le stockage. |
| V3.4.2 | 1 | Conforme | CORS limité à `WEB_URL`. |
| V3.4.3 | 2 | Conforme | CSP stricte sur l’application (`unsafe-inline` pour les styles seulement) ; `default-src 'none'; sandbox` sur le stockage (`deploy/server/Caddyfile`). |
| V3.4.4 | 2 | Conforme | `nosniff` sur l’application et le stockage. |
| V3.4.5 | 2 | Conforme | `Referrer-Policy: strict-origin-when-cross-origin`. |
| V3.4.6 | 2 | Conforme | `frame-ancestors 'none'` sur l’application et le stockage. |
| V3.5.1 | 1 | Conforme | Cookies `SameSite=Lax`, CORS fermé, corps JSON validé (un formulaire d’un autre site ne passe pas), contrôle d’origine de Better Auth. |
| V3.5.2 | 1 | Conforme | Une requête sans prévol n’emporte pas le cookie depuis un autre site et ne passe pas la validation du corps. |
| V3.5.3 | 1 | Conforme | Les `GET` n’ont pas d’effet ; les modifications passent par `POST`, `PATCH` et `PUT`. |
| V3.5.4 | 2 | Conforme | Application et stockage sur deux noms d’hôte. |
| V3.5.5 | 2 | N/A | Pas de `postMessage`. |
| V3.7.1 | 2 | Conforme | Technologies actuelles uniquement. |
| V3.7.2 | 2 | Conforme | Redirections de Better Auth limitées aux origines de confiance (`trustedOrigins`). |

### V4 — API et services web

| Exigence | Niv. | Statut | Constat |
| --- | --- | --- | --- |
| V4.1.1 | 1 | Conforme | `application/json; charset=utf-8` (vérifié), `application/pdf` pour le dossier. |
| V4.1.2 | 2 | À corriger | Faible : Caddy redirige aussi `/api` de HTTP vers HTTPS. |
| V4.1.3 | 2 | Conforme | Le proxy public remplace le `X-Forwarded-For` d’un client ; seuls les proxys internes sont de confiance. |
| V4.2.1 | 2 | Conforme | Caddy puis Node.js, analyse HTTP standard. |
| V4.3.1 | 2 | N/A | Pas de GraphQL. |
| V4.3.2 | 2 | N/A | Pas de GraphQL. |
| V4.4.1 | 1 | N/A | Pas de WebSocket. |
| V4.4.2 | 2 | N/A | Pas de WebSocket. |
| V4.4.3 | 2 | N/A | Pas de WebSocket. |
| V4.4.4 | 2 | N/A | Pas de WebSocket. |

### V5 — Fichiers

| Exigence | Niv. | Statut | Constat |
| --- | --- | --- | --- |
| V5.1.1 | 2 | Partiel | Types et tailles définis dans `@obsio/shared` (rapport 50 Mo, plan 50 Mo, image de plan 30 Mo, photos), non documentés. |
| V5.2.1 | 1 | Conforme | Taille imposée par la signature d’envoi (`content-length-range`). |
| V5.2.2 | 1 | Conforme | Type déclaré confirmé par la signature du contenu (PDF, PNG, JPEG, WebP) avant tout traitement : rapports, plans, photos de preuve (`apps/api/src/file-signature.ts`, `test/file-signature.test.ts`). |
| V5.2.3 | 2 | N/A | Aucune archive acceptée. |
| V5.3.1 | 1 | Conforme | Stockage objet : rien n’est exécuté. |
| V5.3.2 | 1 | Conforme | Clés générées par le serveur ; préfixe de l’organisation revérifié (`routes/imports.ts`, `routes/premises.ts`, `reserves/proofs.ts`). |
| V5.4.1 | 2 | Conforme | Nom d’origine jamais utilisé comme chemin ; PDF servis avec `Content-Disposition: attachment` et un nom fixe (`test/storage.test.ts`). |
| V5.4.2 | 2 | Conforme | Noms servis fixes (`dossier-preuves-<date>.pdf`). |
| V5.4.3 | 2 | À corriger | Aucun antivirus sur les fichiers déposés. |

### V6 — Authentification

| Exigence | Niv. | Statut | Constat |
| --- | --- | --- | --- |
| V6.1.1 | 1 | Partiel | Limitation décrite dans `auth/auth.ts` et la spec, sans section dédiée. |
| V6.1.2 | 2 | Conforme | Liste des mots interdits documentée dans `docs/securite.md` (section « Mots de passe »). |
| V6.1.3 | 2 | Conforme | Un seul parcours, e-mail et mot de passe sur invitation, décrit dans la spec. |
| V6.2.1 | 1 | Conforme | 12 caractères minimum (15 recommandés par l’ASVS). |
| V6.2.2 | 1 | À corriger | Pas de page de changement de mot de passe, seulement la réinitialisation par e-mail. |
| V6.2.3 | 1 | À corriger | Dépend de 6.2.2 (Better Auth exige l’ancien mot de passe, l’interface manque). |
| V6.2.4 | 1 | Conforme | Mots de passe divulgués refusés (Have I Been Pwned, plus d’un demi-milliard d’entrées, dont les plus courants). |
| V6.2.5 | 1 | Conforme | Pas de règle de composition. |
| V6.2.6 | 1 | Conforme | `type="password"`. |
| V6.2.7 | 1 | Conforme | Collage et gestionnaires de mots de passe permis (`autocomplete`). |
| V6.2.8 | 1 | Conforme | Mot de passe vérifié tel quel. |
| V6.2.9 | 2 | Conforme | Jusqu’à 128 caractères. |
| V6.2.10 | 2 | Conforme | Pas de renouvellement périodique imposé. |
| V6.2.11 | 2 | Conforme | Mots du contexte, nom et adresse refusés (`apps/api/src/auth/password-policy.ts`, `test/password-policy.test.ts`). |
| V6.2.12 | 2 | Conforme | Plugin `haveIBeenPwned` de Better Auth à l’inscription, à la réinitialisation et au changement (k-anonymat : 5 caractères de l’empreinte envoyés). |
| V6.3.1 | 1 | Conforme | Limitation par adresse IP : connexion 10 par 5 min, inscription et réinitialisation 5 par heure. |
| V6.3.2 | 1 | Conforme | Aucun compte par défaut ; le compte opérateur n’a pas de mot de passe. |
| V6.3.3 | 2 | Conforme | Double authentification obligatoire pour tous les comptes : TOTP (plugin `twoFactor`), sans désactivation ni appareil de confiance ; API et routes de Better Auth refusées tant qu’elle n’est pas activée (`apps/api/src/auth/two-factor.ts`). |
| V6.3.4 | 2 | Conforme | Un seul parcours ; le lien intervenant est un accès limité à une assignation, documenté. |
| V6.4.1 | 1 | Conforme | Pas de mot de passe initial ; invitations aléatoires valables 7 jours. |
| V6.4.2 | 1 | Conforme | Ni indice ni question secrète. |
| V6.4.3 | 2 | Conforme | Lien de réinitialisation à durée limitée, qui ferme les sessions ; la connexion suivante demande toujours le code TOTP. |
| V6.4.4 | 2 | Conforme | Facteur perdu : codes de secours, sinon `pnpm user:reset-2fa` par l’éditeur après vérification de l’identité auprès de l’admin de l’organisation, par un autre canal que l’e-mail ; le mot de passe reste exigé. |
| V6.5.1 | 2 | Conforme | Codes de secours à usage unique ; un code TOTP accepté est refusé s’il est rejoué pendant sa validité. |
| V6.5.2 | 2 | Partiel | Codes de secours (environ 50 bits) chiffrés en base avec BETTER_AUTH_SECRET, et non hachés avec sel comme demandé sous 112 bits ; secret TOTP chiffré. |
| V6.5.3 | 2 | Conforme | Secret TOTP et codes de secours tirés par le générateur aléatoire cryptographique de Better Auth. |
| V6.5.4 | 2 | Conforme | Codes de secours de 10 caractères alphanumériques, codes TOTP de 6 chiffres : au-delà de 20 bits. |
| V6.5.5 | 2 | Conforme | Code TOTP valable 30 secondes, une période de part et d’autre tolérée (90 secondes au plus) ; compte verrouillé 15 minutes après 10 codes faux. |
| V6.6.1 | 2 | N/A | Pas d’authentification hors bande (SMS, notification). |
| V6.6.2 | 2 | N/A | Pas d’authentification hors bande (SMS, notification). |
| V6.6.3 | 2 | N/A | Pas d’authentification hors bande (SMS, notification). |
| V6.8.1 | 2 | N/A | Pas de fournisseur d’identité externe. |
| V6.8.2 | 2 | N/A | Pas de fournisseur d’identité externe. |
| V6.8.3 | 2 | N/A | Pas de fournisseur d’identité externe. |
| V6.8.4 | 2 | N/A | Pas de fournisseur d’identité externe. |

### V7 — Sessions

| Exigence | Niv. | Statut | Constat |
| --- | --- | --- | --- |
| V7.1.1 | 2 | Conforme | Durées documentées et justifiées dans `docs/securite.md` (« Sessions »). |
| V7.1.2 | 2 | Conforme | Sessions parallèles permises sans limite, comportement documenté. |
| V7.1.3 | 2 | N/A | Pas de fédération d’identité. |
| V7.2.1 | 1 | Conforme | Session vérifiée en base par l’API à chaque requête. |
| V7.2.2 | 1 | Conforme | Jetons de session générés à la connexion. |
| V7.2.3 | 1 | Conforme | Jeton aléatoire de 32 caractères (environ 190 bits), signé. |
| V7.2.4 | 1 | Conforme | Nouvelle session à chaque connexion. |
| V7.3.1 | 2 | Conforme | Reconnexion après 2 heures sans activité (`apps/api/src/auth/auth.ts`, `test/sessions.test.ts`). |
| V7.3.2 | 2 | Conforme | Durée maximale de 12 heures imposée par un déclencheur en base (migration `0007_session_lifetime`). |
| V7.4.1 | 1 | Conforme | La déconnexion supprime la session en base. |
| V7.4.2 | 1 | Conforme | Compte supprimé : sessions supprimées en cascade ; membre retiré : appartenance relue à chaque requête. |
| V7.4.3 | 2 | Partiel | La réinitialisation ferme toutes les sessions ; pas de changement de mot de passe (6.2.2). |
| V7.4.4 | 2 | Conforme | « Se déconnecter » dans l’en-tête. |
| V7.4.5 | 2 | Partiel | L’admin peut retirer un membre (accès coupé) mais pas fermer ses sessions. |
| V7.5.1 | 2 | Conforme | Changement d’adresse e-mail désactivé (défaut de Better Auth). |
| V7.5.2 | 2 | À corriger | Pas de liste des sessions actives. |
| V7.6.1 | 2 | N/A | Pas de fournisseur d’identité. |
| V7.6.2 | 2 | Conforme | Session créée seulement par une connexion explicite. |

### V8 — Autorisation

| Exigence | Niv. | Statut | Constat |
| --- | --- | --- | --- |
| V8.1.1 | 1 | Partiel | Rôles décrits dans la spec et `@obsio/shared/permissions`, sans matrice par route. |
| V8.1.2 | 2 | Partiel | Pas de règle documentée au niveau du champ. |
| V8.2.1 | 1 | Conforme | Garde sur chaque route (`requireUser`, `requireOrganisation`, `requireAdmin`), jeton pour le lien intervenant. |
| V8.2.2 | 1 | Conforme | RLS, identifiants relus dans la transaction, clés étrangères composites ; `test/rls.test.ts`. |
| V8.2.3 | 2 | Conforme | Schémas de réponse Zod (champs choisis), corps limités aux champs autorisés. |
| V8.3.1 | 1 | Conforme | Autorisations appliquées par l’API et la base. |
| V8.4.1 | 2 | Conforme | RLS forcée sur toutes les tables métier, test de couverture. |

### V9 — Jetons autoportés

| Exigence | Niv. | Statut | Constat |
| --- | --- | --- | --- |
| V9.1.1 | 1 | N/A | Sessions par référence en base, pas de JWT. |
| V9.1.2 | 1 | N/A | Sessions par référence en base, pas de JWT. |
| V9.1.3 | 1 | N/A | Sessions par référence en base, pas de JWT. |
| V9.2.1 | 1 | N/A | Sessions par référence en base, pas de JWT. |
| V9.2.2 | 2 | N/A | Sessions par référence en base, pas de JWT. |
| V9.2.3 | 2 | N/A | Sessions par référence en base, pas de JWT. |
| V9.2.4 | 2 | N/A | Sessions par référence en base, pas de JWT. |

### V10 — OAuth et OIDC

Non applicable (29 exigences) : Pas de connexion par OAuth ou OpenID Connect : comptes propres, e-mail et mot de passe.


### V11 — Cryptographie

| Exigence | Niv. | Statut | Constat |
| --- | --- | --- | --- |
| V11.1.1 | 2 | À corriger | Pas de politique de gestion des clés (`BETTER_AUTH_SECRET`, clés du stockage, mots de passe des rôles : création, rotation, révocation). |
| V11.1.2 | 2 | À corriger | Pas d’inventaire cryptographique. |
| V11.2.1 | 2 | Conforme | `node:crypto`, scrypt de Better Auth, TLS de Caddy. |
| V11.2.2 | 2 | Partiel | Algorithmes portés par les bibliothèques, sans procédure de changement. |
| V11.2.3 | 2 | Conforme | SHA-256, HMAC-SHA-256, jetons de 256 bits. |
| V11.3.1 | 1 | N/A | Pas de chiffrement applicatif. |
| V11.3.2 | 1 | N/A | Pas de chiffrement applicatif. |
| V11.3.3 | 2 | N/A | Pas de chiffrement applicatif. |
| V11.4.1 | 1 | Conforme | SHA-256 (empreinte des jetons), HMAC-SHA-256 (cookies). |
| V11.4.2 | 2 | Conforme | scrypt (Better Auth). |
| V11.4.3 | 2 | Conforme | SHA-256. |
| V11.4.4 | 2 | N/A | Aucune clé dérivée d’un mot de passe. |
| V11.5.1 | 2 | Conforme | `randomBytes(32)` pour les liens intervenant, `crypto.randomUUID`, générateur de Better Auth. |
| V11.6.1 | 2 | Conforme | Clés TLS générées par Caddy (Let’s Encrypt). |

### V12 — Communications

| Exigence | Niv. | Statut | Constat |
| --- | --- | --- | --- |
| V12.1.1 | 1 | Conforme | Caddy : TLS 1.2 et 1.3 uniquement, 1.3 préféré. |
| V12.1.2 | 2 | Conforme | Suites par défaut de Caddy (chiffrement authentifié, confidentialité persistante). |
| V12.1.3 | 2 | N/A | Pas de certificat client. |
| V12.2.1 | 1 | Conforme | HTTPS partout, HSTS. |
| V12.2.2 | 1 | Conforme | Certificats Let’s Encrypt. |
| V12.3.1 | 2 | Partiel | Mistral en HTTPS ; SMTP en STARTTLS opportuniste (`requireTLS` absent) ; services internes en clair (12.3.3). |
| V12.3.2 | 2 | Conforme | Certificats vérifiés par Node.js (comportement par défaut). |
| V12.3.3 | 2 | Écart proposé | PostgreSQL, Redis et stockage en clair sur le réseau Docker interne d’un seul serveur. |
| V12.3.4 | 2 | N/A | Pas de TLS interne (12.3.3). |

### V13 — Configuration

| Exigence | Niv. | Statut | Constat |
| --- | --- | --- | --- |
| V13.1.1 | 2 | Partiel | Services externes cités dans la spec (Mistral, SMTP, stockage), sans document des flux. |
| V13.2.1 | 2 | Conforme | PostgreSQL, stockage et Redis (mot de passe exigé, `deploy/compose.yml`) authentifiés. |
| V13.2.2 | 2 | Conforme | Rôle propriétaire de la base et compte principal du stockage réservés au service `setup` ; l’API et le worker ont le rôle `app_user` (sans contournement de la RLS) et un compte de stockage limité aux objets du bucket (`apps/api/src/storage-admin.ts`, `test/storage-admin.test.ts`). |
| V13.2.3 | 2 | Conforme | Identifiants choisis à l’installation (`changer-moi` dans les modèles). |
| V13.2.4 | 2 | Partiel | Un seul service externe appelé (Mistral), sans liste blanche réseau. |
| V13.2.5 | 2 | Partiel | Pare-feu OVH sur l’entrant ; sortant non restreint par destination. |
| V13.3.1 | 2 | Écart proposé | Secrets dans un fichier d’environnement sur le serveur (droits restreints), pas de coffre-fort. |
| V13.3.2 | 2 | Conforme | Chaque service ne reçoit que les secrets dont il a besoin (voir 13.2.2). |
| V13.4.1 | 1 | Conforme | `.git` exclu des images (`.dockerignore`). |
| V13.4.2 | 2 | Conforme | `NODE_ENV=production`, pas de mode de débogage. |
| V13.4.3 | 2 | Conforme | Caddy sans listing de répertoire. |
| V13.4.4 | 2 | Conforme | `TRACE` renvoie 404 (vérifié). |
| V13.4.5 | 2 | Conforme | Seul `/api/health` est public, et ne donne que l’état des services. |

### V14 — Protection des données

| Exigence | Niv. | Statut | Constat |
| --- | --- | --- | --- |
| V14.1.1 | 2 | À corriger | Pas de classification des données (rapports, plans, photos, données personnelles des membres et intervenants). |
| V14.1.2 | 2 | À corriger | Dépend de 14.1.1. |
| V14.2.1 | 1 | Conforme | Jetons dans l’URL (lien intervenant, réinitialisation, vérification d’e-mail) inévitables pour un lien envoyé par e-mail, mais masqués dans les journaux (`apps/api/src/logging.ts`) ; signatures des liens du stockage à courte durée. |
| V14.2.2 | 2 | Conforme | Aucun cache serveur des réponses de l’API (Caddy ne met en cache que les fichiers statiques). |
| V14.2.3 | 2 | Conforme | Aucun traceur ; Mistral est un sous-traitant déclaré (PDF transmis dans la requête). |
| V14.2.4 | 2 | À corriger | Dépend de 14.1.1. |
| V14.3.1 | 1 | Conforme | Cookie de session supprimé et cache de React Query vidé à la déconnexion ; la file hors ligne de l’intervenant ne contient que ses envois en attente. |
| V14.3.2 | 2 | Conforme | `Cache-Control: no-store` sur toutes les réponses de l’API (hook `onSend`, `test/errors.test.ts`). |
| V14.3.3 | 2 | Conforme | IndexedDB ne contient que la file d’envoi hors ligne de l’intervenant, vidée après envoi. |

### V15 — Code et architecture

| Exigence | Niv. | Statut | Constat |
| --- | --- | --- | --- |
| V15.1.1 | 1 | À corriger | Délais de correction non documentés (Dependabot et `pnpm audit` en place). |
| V15.1.2 | 2 | Partiel | `pnpm-lock.yaml` (versions et empreintes), pas de SBOM. |
| V15.1.3 | 2 | À corriger | Fonctions coûteuses (extraction, dossier PDF, export) non documentées. |
| V15.2.1 | 1 | Partiel | Aucune faille connue en production (`pnpm audit`), mais pas de délai défini. |
| V15.2.2 | 2 | Conforme | Extraction en file BullMQ, limitation par adresse IP, quotas par organisation sur l’analyse et le dossier PDF. |
| V15.2.3 | 2 | Conforme | Images sans tests ; la démonstration n’est qu’une commande, rien n’est exposé. |
| V15.3.1 | 1 | Conforme | Schémas de réponse Zod. |
| V15.3.2 | 2 | N/A | Aucun appel vers une URL externe variable (SDK Mistral, adresse fixe). |
| V15.3.3 | 2 | Conforme | Zod retire les champs inconnus ; colonnes écrites explicitement. |
| V15.3.4 | 2 | Conforme | Adresse du client transmise par Caddy ; proxys de confiance déclarés dans Fastify et Better Auth. |
| V15.3.5 | 2 | Conforme | TypeScript strict et Zod. |
| V15.3.6 | 2 | Conforme | Parseur JSON de Fastify protégé ; pas de fusion récursive d’objets reçus. |
| V15.3.7 | 2 | Conforme | Chemin, requête et corps validés séparément par Zod. |

### V16 — Journalisation et erreurs

| Exigence | Niv. | Statut | Constat |
| --- | --- | --- | --- |
| V16.1.1 | 2 | À corriger | Pas d’inventaire des journaux. |
| V16.2.1 | 2 | Conforme | Événements de sécurité avec heure, adresse IP, méthode, URL sans jetons, utilisateur et organisation ; journal métier `reserve_event` (qui, quoi, quand). |
| V16.2.2 | 2 | Conforme | Horodatage UTC (millisecondes epoch), horloge système synchronisée. |
| V16.2.3 | 2 | Partiel | Journaux Docker sur le serveur, non documentés. |
| V16.2.4 | 2 | Conforme | JSON (pino). |
| V16.2.5 | 2 | Partiel | URL journalisées sans leurs jetons (`test/logging.test.ts`) ; règles par niveau de protection à définir avec la classification des données (14.1.1). |
| V16.3.1 | 2 | Conforme | Connexion, inscription, déconnexion, réinitialisation et changement de mot de passe, réussite comme échec (`apps/api/src/security-log.ts`, `test/security-log.test.ts`). |
| V16.3.2 | 2 | Conforme | Réponses 401 et 403 journalisées avec l’utilisateur, l’organisation et la route ; liens intervenant refusés. |
| V16.3.3 | 2 | Conforme | Événements définis dans `docs/securite.md` (« Journal de sécurité ») : refus de validation, dépassements de limite, refus d’accès. |
| V16.3.4 | 2 | Conforme | Erreurs 5xx journalisées avec leur détail par le gestionnaire d’erreurs ; échecs du worker journalisés. |
| V16.4.1 | 2 | Conforme | JSON : pas d’injection de ligne. |
| V16.4.2 | 2 | Partiel | Journaux Docker accessibles à root seulement (sudo par mot de passe), mais modifiables par lui. |
| V16.4.3 | 2 | À corriger | Aucun envoi vers un système séparé. |
| V16.5.1 | 2 | Conforme | Gestionnaire d’erreurs (`apps/api/src/errors.ts`) : message générique pour toute erreur 5xx, détail dans le journal ; test `test/errors.test.ts`. |
| V16.5.2 | 2 | Conforme | Extraction en tâche de fond avec 3 essais, échec affiché à l’utilisateur. |
| V16.5.3 | 2 | Partiel | Transactions annulées en cas d’erreur ; mais la limitation de débit est levée si Redis est indisponible (`skipOnError`). |

### V17 — WebRTC

Non applicable (7 exigences) : Pas de WebRTC.

