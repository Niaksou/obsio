# Spécification produit — Obsio

Version du 24 octobre 2026 · Clément Palanca

## Vision et périmètre

Obsio transforme le rapport annuel de vérification électrique en une liste de réserves suivies jusqu'à leur levée, localisées sur le plan du bâtiment et prouvées.

**Problème.** Chaque année, un organisme de contrôle remet un rapport PDF listant les non-conformités. L'employeur doit les corriger et formaliser leur levée dans le registre de sécurité. En pratique, le suivi se fait sur Excel ou pas du tout, et les mêmes réserves reviennent d'une année sur l'autre.

**Cible du MVP.** Sites industriels et PME multi-bâtiments, côté responsable maintenance ou HSE. Les collectivités et gestionnaires de patrimoine, déjà visés par les registres généralistes, viennent plus tard.

**Proposition de valeur.**

- Import du rapport en quelques minutes, sans ressaisie, grâce à l'extraction automatique validée par l'utilisateur.
- Chaque réserve rattachée à un équipement placé sur le plan, avec son historique.
- L'électricien corrige et prouve depuis son téléphone, sans compte.
- Un dossier de preuves prêt pour l'inspection du travail, l'assureur ou la prochaine visite.

**Différenciation.** Les registres de sécurité dématérialisés existants couvrent tous les registres de façon générale. Ce produit va en profondeur sur l'électrique : lecture des rapports, modèle par équipement, boucle avec le prestataire.

**Principe directeur.** Un produit solide avant de vendre : extraction fiable, validation humaine systématique, aucune réserve perdue.

## Personas et parcours

Trois rôles suffisent au MVP : un qui paie et pilote, un qui contribue, un qui intervient sans compte.

| Persona | Rôle dans le produit | Besoin principal | Accès |
| --- | --- | --- | --- |
| Responsable maintenance ou HSE | Administrateur de l'organisation | Savoir ce qui reste ouvert et prouver la conformité | Compte, web desktop |
| Technicien interne | Membre | Corriger et documenter les réserves simples | Compte, PWA mobile |
| Électricien prestataire | Intervenant externe | Voir ses réserves, prouver la correction | Lien signé, PWA mobile, sans compte |

**Parcours 1 — Importer le rapport annuel (responsable)**

1. Dépose le PDF du rapport sur un site.
2. Attend l'analyse (quelques dizaines de secondes à quelques minutes).
3. Revoit chaque réserve extraite à côté de l'extrait surligné du PDF, corrige si besoin.
4. Confirme le rattachement proposé à un équipement du plan, ou le choisit.
5. Valide l'import : les réserves deviennent actives, les reconduites sont signalées.

**Parcours 2 — Faire lever les réserves (responsable puis électricien)**

1. Le responsable sélectionne des réserves et les assigne à un intervenant avec une échéance.
2. L'électricien reçoit un lien par e-mail, ouvre la liste sur son téléphone, y compris hors réseau.
3. Pour chaque réserve : photo, commentaire, statut « corrigée ».
4. Le responsable reçoit une notification, vérifie et clôt la réserve.

**Parcours 3 — Préparer un contrôle (responsable)**

1. Ouvre le tableau de bord du site : réserves ouvertes, en retard, reconduites.
2. Exporte le dossier de preuves en PDF (réserves, dates, intervenants, photos).

## Fonctionnalités du MVP

Le MVP couvre la boucle complète import → assignation → preuve → export, en 2D uniquement.

**Dans le MVP**

- Organisation, utilisateurs, rôles (admin, membre), invitations par e-mail.
- Sites, bâtiments, étages ; import d'un plan par étage (PDF ou image).
- Équipements (tableaux électriques en priorité) placés sur le plan 2D.
- Import d'un rapport PDF avec extraction automatique et écran de validation.
- Vérifications demandées par l'assureur, en plus des rapports du Code du travail : comptes rendus Q18 (référentiel APSAD D18) et thermographie infrarouge Q19 (référentiel APSAD D19). Une même anomalie signalée dans plusieurs documents est une seule réserve avec plusieurs sources.
- Réserves : statut, gravité, échéance, assignation, commentaires, historique.
- Détection des réserves reconduites d'un rapport à l'autre.
- Lien intervenant signé, à durée limitée, limité aux réserves assignées.
- PWA mobile avec prise de photo et file d'envoi hors ligne.
- Tableau de bord par site et notifications e-mail (assignation, correction, retard).
- Export PDF du dossier de preuves.

**Hors MVP (plus tard)**

- Vue 3D par extrusion des plans (React Three Fiber) : confirmée après le MVP, faute de murs dans un plan PDF ou image. Livrée après J6, avec le calibrage de l'échelle des étages (voir « Après le MVP »).
- Import BIM (IFC) et détection automatique des murs.
- Autres vérifications périodiques : incendie, levage, gaz, portes automatiques.
- Planning des prochaines visites et relances de l'organisme de contrôle : livré après J6 (voir « Après le MVP »).
- Facturation en libre-service, multi-langue, API publique, SSO.

## Architecture technique

Un front React et une API Node séparés, en TypeScript de bout en bout, avec l'extraction isolée dans un worker.

```
┌────────────────────┐  HTTPS   ┌──────────────────────┐ ──▶ ┌──────────────────────┐
│ Front React (PWA)  │ ───────▶ │ API Fastify          │     │ PostgreSQL (RLS)     │
│ Desktop : resp.    │          │ Auth, cloisonnement  │ ──▶ ├──────────────────────┤
│ Mobile : électric. │          │ Liens signés         │     │ Stockage objet S3    │
└────────────────────┘          └──────────┬───────────┘ ──▶ ├──────────────────────┤
                                           │ enfile          │ Service e-mail       │
                                           ▼                 └──────────────────────┘
                                ┌──────────────────────┐
                                │ File BullMQ (Redis)  │
                                └──────────┬───────────┘
                                           ▼
┌────────────────────┐          ┌──────────────────────┐
│ Mistral (UE)       │ ◀──────▶ │ Worker d'extraction  │
│ OCR + extraction   │          │ Lit le PDF, Zod,     │
│ JSON structurée    │          │ écrit le brouillon   │
└────────────────────┘          └──────────────────────┘

Hébergement : un VPS OVH (société française, serveur dans l'Union européenne pour des données réelles) qui fait tout tourner avec Docker Compose, au coût le plus bas ; sans Kubernetes. Les services gérés (PostgreSQL, stockage S3) viendront pour la production, chez le même hébergeur. Procédure : `docs/deploiement.md`.

Livraison : trois images construites par le même `Dockerfile`. `api` (avec les migrations, `node dist/db/migrate.js`, l'ouverture d'un client, `node dist/cli/create-organisation.js`, l'export et la suppression de ses données, `export-organisation.js` et `delete-organisation.js`). Le rôle propriétaire de la base n'est donné qu'au service `setup` (migrations, suppression d'une organisation), jamais à l'API ni au worker ; l'API et le worker utilisent un compte de stockage limité au bucket, créé par `setup` avec le compte principal de RustFS ; Redis exige un mot de passe, `worker`, et `web` (Caddy, qui sert le front et transmet `/api` à l'API : une seule origine publique, donc des cookies de session sans CORS). L'URL publique est fixée au build du front (`VITE_API_URL`). Derrière un proxy, `TRUST_PROXY=true` pour que la limitation de débit voie l'adresse du client. `deploy/compose.yml` monte la pile complète (avec PostgreSQL, Redis, RustFS et Mailpit) pour une préproduction sur une seule machine. Sur le serveur, `deploy/compose.server.yml` s'y ajoute : un proxy Caddy prend les ports 80 et 443 avec HTTPS automatique (Let's Encrypt) pour l'application et pour le stockage, servi sur son propre sous-domaine puisque le navigateur y envoie les fichiers directement ; Mailpit laisse la place au SMTP de Brevo ; sauvegarde quotidienne de la base (`pg_dump`, sept jours).
```

Le front ne parle qu'à l'API ; l'import d'un rapport est mis en file et traité par le worker, qui appelle Mistral puis écrit un brouillon en base.

| Brique | Choix | Pourquoi |
| --- | --- | --- |
| Code partagé | Monorepo (pnpm workspaces), package commun de types et schémas Zod | Front et back séparés sans dupliquer les types |
| Front | React + Vite, PWA (service worker, IndexedDB), Konva pour le plan 2D | Une seule app desktop et mobile, mode hors ligne |
| 3D (plus tard) | React Three Fiber | Écosystème Three.js le plus confortable en React |
| Back | Node.js, Fastify, validation des routes par Zod | Même langage que le front, léger, peu de code répétitif |
| Base de données | PostgreSQL + Drizzle, Row Level Security | Cloisonnement garanti par la base ; Drizzle reste proche du SQL et déclare les politiques RLS |
| Tâches de fond | BullMQ sur Redis | Imports longs hors des requêtes HTTP |
| Fichiers | Stockage objet compatible S3, URLs signées (RustFS en local) | PDF, plans et photos hors de la base |
| Antivirus | ClamAV (clamd), interrogé par l'API à chaque dépôt | Fichiers infectés refusés avant tout traitement |
| Extraction | Mistral OCR + modèle Mistral en sortie structurée | Hébergé dans l'UE, bon sur les tableaux |
| Auth | Better Auth (plugins organisation et double authentification TOTP, obligatoire) ; jetons signés pour les intervenants | Organisations, rôles, invitations et TOTP fournis ; pas de compte pour l'électricien |
| E-mail | Brevo (France), en SMTP | Notifications et envoi des liens ; offre gratuite suffisante au départ |
| Notifications sur le téléphone | Web Push (standard du navigateur, clés VAPID, bibliothèque `web-push`), file BullMQ dans l'API | Sans application à publier ; sur iPhone, Obsio doit être ajouté à l'écran d'accueil |
| Hébergement | VPS OVH avec Docker Compose (services gérés pour la production) | Coût minimal, société française, argument RGPD |

## Pipeline d'extraction (Mistral)

L'extraction propose, l'utilisateur valide : aucune réserve ne devient active sans relecture humaine.

1. **Dépôt.** L'API stocke le PDF sous `organisations/{organisation}/imports/{import}/rapport.pdf` (`reportImportKeys`), crée un `ImportRapport` au statut `en_analyse` et enfile une tâche BullMQ `extract-report`.
2. **OCR.** Le worker appelle Mistral OCR avec une version de modèle figée (OCR 4 ou plus, pour les blocs classés et leurs positions dans la page). Sortie : markdown par page, tableaux en HTML, blocs positionnés.
3. **Extraction.** Le texte part vers un modèle Mistral en sortie structurée (schéma JSON). Sortie : en-tête du rapport (organisme, date, site) et liste des réserves.
4. **Validation technique.** Zod valide le JSON ; en cas d'échec, une nouvelle tentative, puis statut `erreur` visible par l'utilisateur.
5. **Rapprochement.** Pour chaque réserve : proposition d'équipement à partir de `localisation_texte`, et détection des reconduites par comparaison avec les réserves ouvertes du site.
6. **Brouillon.** Les réserves sont stockées en `ReserveBrouillon`, statut de l'import `a_valider`. C'est l'API qui range le résultat (`extraction.json`) en base, dès la fin de la tâche (événements BullMQ) et à chaque consultation de l'import ; le worker n'accède pas à la base.
7. **Validation humaine.** Écran côte à côte : réserve extraite et passage surligné du PDF. Les réserves à faible confiance sont mises en avant.
8. **Activation.** À la validation, les brouillons deviennent des `Reserve` actives.

**Champs extraits par réserve**

| Champ | Exemple | Usage |
| --- | --- | --- |
| `reference` | Obs. 12 | Retrouver la réserve dans le rapport papier |
| `article_reglementaire` | référence du texte cité | Affichage, filtre |
| `description` | Absence de différentiel 30 mA sur le circuit prises | Texte principal (le constat) |
| `preconisation` | A remplacer par un interrupteur de calibre 63 A | Ce que l'électricien doit faire |
| `localisation_texte` | TD2 atelier, départ 4 | Proposition d'équipement |
| `gravite` | à traiter rapidement | Tri, échéance par défaut |
| `nouvelle_ou_reconduite` | reconduite | Indicateur du tableau de bord ; lu dans le rapport quand l'organisme le marque (colonne « déjà signalée », astérisque, date de premier signalement, gras, badge) |
| `page_source` + blocs | page 7 | Surlignage dans le PDF |
| `confiance` | 0,86 | Mise en avant à la relecture |

Le contrat de sortie est `extractedReportSchema` (`packages/shared/src/extraction.ts`) et les règles de saisie sont dans `docs/extraction-conventions.md`, qui sert aussi au prompt.

**Traçabilité et qualité**

- Chaque extraction garde la version du modèle OCR, du modèle d'extraction, du prompt, et la sortie brute.
- Le fournisseur est derrière une interface `ExtractionProvider` pour pouvoir en changer.
- Le worker range à côté du PDF le résultat de l'OCR (`ocr.json`, réutilisé si la tâche est relancée, car l'OCR est facturé à la page) et le résultat de l'extraction (`extraction.json`, validé par `extractionOutcomeSchema` : rapport ou erreur, avec la traçabilité). Une sortie qui reste invalide après le nouvel essai n'est pas relancée ; les erreurs réseau ou de quota le sont.
- Un jeu de test de vrais rapports anonymisés, issus de plusieurs organismes de contrôle, avec le résultat attendu, est passé à chaque changement de modèle ou de prompt.
- Toute extraction corrigée à la main par un utilisateur est candidate au jeu de test.

## Modèle de données

La hiérarchie suit le terrain : Organisation → Site → Bâtiment → Étage → Équipement → Réserve. Une réserve vient d'un rapport et se rattache à un équipement.

| Entité | Champs clés | Relations |
| --- | --- | --- |
| `Organisation` | nom, SIRET, plan d'abonnement | possède sites ; a des membres |
| `Utilisateur` | e-mail, nom | membre d'une ou plusieurs organisations, avec un rôle (admin, membre) dans chacune |
| `Site` | nom, adresse | appartient à une organisation ; contient bâtiments |
| `Batiment` | nom | appartient à un site ; contient étages |
| `Etage` | nom, niveau, fichier du plan, échelle | appartient à un bâtiment |
| `Equipement` | type (TGBT, TD, coffret, armoire, éclairage de sécurité, prise de courant, luminaire, transformateur, onduleur, borne de recharge, machine, autre), repère ou nom de machine propre à l'entreprise (« TD2 », « Presse 3 »), position x/y sur le plan (en proportion de l'image, de 0 à 1), alias textuels | placé sur un étage ; porte des réserves |
| `RapportVerification` | organisme, date de visite, type de document (`periodique`, `initiale`, `q18`, `q19`), numéro, fichier PDF ; pour un Q18, état des 8 constatations standard et conclusion ; pour un Q19, nombre d'anomalies par priorité | concerne un site ; produit des réserves (un PDF importé peut contenir plusieurs documents) |
| `ImportRapport` | statut (`en_analyse`, `a_valider`, `valide`, `erreur`), versions modèles et prompt, sortie brute | un par rapport importé |
| `ReserveBrouillon` | champs extraits, confiance, équipement proposé | appartient à un import ; devient une réserve |
| `Reserve` | description, gravité, statut (`ouverte`, `assignee`, `corrigee`, `levee`), échéance, reconduite de | liée à un équipement ; a une ou plusieurs sources |
| `SourceReserve` | document (rapport du Code du travail, Q18, Q19), référence, code d'observation, texte, article, page, constatation Q18, relevé thermique | relie une réserve à chaque document qui la signale |
| `Intervenant` | nom, société, e-mail | externe à l'organisation |
| `Assignation` | réserves, intervenant, échéance, jeton signé, expiration | donne accès aux réserves assignées |
| `ReserveCollaborateur` | réserve, membre, assignée par, date, retrait | membres de l'organisation chargés de corriger une réserve (table `reserve_member`) |
| `Preuve` | photo(s), commentaire, date, auteur | jointe à une réserve |
| `Evenement` | type, auteur, date, avant/après | journal d'audit de chaque réserve |
| `EcheancierVerification` | type (`periodique`, `q18`, `q19`), suivie ou non, périodicité en mois, visite programmée, contact de l'organisme | un par site et par type ; la dernière visite vient des rapports validés (table `inspection_plan`) |

**Règles notables**

- Décisions prises en J3, à relire :
  - Validation d'un import : chaque brouillon doit être retenu ou écarté un par un, il n'y a pas de « tout retenir ».
  - Une réserve reconduite reste en base avec son historique, mais sort des listes de réserves en cours dès qu'une réserve d'un import suivant la reconduit : la nouvelle prend le relais.
  - L'import, la relecture et la validation sont réservés à l'admin ; les membres consultent.
  - En développement, `EXTRACTION_PROVIDER=fixtures` rejoue le résultat attendu d'un PDF du jeu de test pour démontrer l'import sans Mistral ; ce mode est refusé en production.
- Décisions prises en J4 et J5, à relire :
  - Statuts : `ouverte` → `assignee` (lien envoyé ou collaborateur chargé) → `corrigee` (preuve avec « corrigée », par un membre ou l'intervenant) → `levee` (admin). L'admin peut refuser la correction : la réserve revient à `assignee` si un lien est encore actif ou un collaborateur chargé, sinon à `ouverte`. Révoquer le dernier lien actif ou retirer le dernier collaborateur ramène une réserve assignée à `ouverte`.
  - Une réserve est « en retard » si elle est ouverte ou assignée et que son échéance est passée (date du jour à Paris) ; une réserve corrigée attend l'admin et n'est plus en retard.
  - L'échéance de l'assignation devient celle des réserves assignées. Une réserve corrigée ou levée ne peut pas être assignée ; une réserve réassignée sort de la vue du lien précédent.
  - Modification d'une réserve (description, préconisation, échéance, équipement), assignation, révocation et levée : admin. Consultation, commentaires et preuves : tout membre.
  - Une preuve contient au moins une photo ou un commentaire (6 photos au plus, réduites à 2000 px dans le navigateur). Les preuves ne sont ni modifiées ni supprimées (droits retirés à `app_user`).
  - Le lien de l'intervenant n'est montré qu'une fois à l'admin (et envoyé par e-mail) : seule l'empreinte SHA-256 du jeton est stockée. L'API le retrouve par une politique RLS dédiée (`assignment_token_lookup`), puis travaille dans le cloisonnement de l'organisation.
  - Hors ligne : l'application est mise en cache par un service worker écrit à la main (`public/sw.js`, actif en production seulement) ; les preuves passent par une file IndexedDB rejouée au retour du réseau, sans doublon grâce au `clientId` choisi par le téléphone. La vue de l'intervenant garde sa dernière version sur l'appareil.
  - Relances de retard (J6) : chaque jour à 8 h (Paris), une tâche planifiée BullMQ dans l'API envoie aux admins, par site, le nombre de réserves en retard le jour où une réserve dépasse son échéance, et chaque lundi un récapitulatif s'il en reste. Pas de relance à l'intervenant (son lien n'est pas conservé en clair).
  - Le tableau de bord lit le dernier compte rendu Q18 validé du site (date de visite la plus récente) : alerte si sa conclusion est « risque », et liste des constatations cochées « non vérifié ».
  - Limitation de débit : 600 requêtes par minute et par adresse IP sur l'API, 60 sur les liens intervenant (compteurs dans Redis).

- Chaque table porte `organisation_id`, filtré par Row Level Security.
- `Reserve.reconduite_de` pointe vers la réserve de l'année précédente : c'est elle qui donne l'historique d'un équipement.
- Une anomalie signalée dans plusieurs documents (rapport du Code du travail et Q18, par exemple) est **une seule réserve avec plusieurs sources** : l'électricien la corrige une fois, une seule preuve la lève pour toutes ses sources, et l'export se filtre par origine (dossier pour l'assureur, dossier réglementaire). Le rapprochement est proposé automatiquement (même code d'observation, sinon texte et localisation proches) et confirmé par l'utilisateur à la validation.
- Q18 : chaque point de non-conformité est une source ; une constatation standard cochée en danger sans point rattaché est proposée comme réserve à la validation (texte de la constatation), jamais créée par l'IA.
- `Equipement.alias` (« TD2 », « tableau atelier ») améliore le rapprochement automatique au fil des imports.
- Seul l'admin crée et modifie sites, bâtiments, étages, plans et équipements ; les membres les consultent.
- Les liens site → bâtiment → étage → équipement passent par la paire (id, organisation_id) : une clé étrangère ne passe pas par la RLS, la paire interdit de rattacher une ligne au parent d'une autre organisation.
- Sites, bâtiments, étages et équipements sont archivés, jamais supprimés.
- Tables en anglais dans le code : `site`, `building`, `floor`, `equipment`.
- Rien n'est supprimé physiquement : une réserve levée reste consultable, et le journal `Evenement` sert de preuve.

## Sécurité, multi-tenant et RGPD

Un client ne doit jamais voir les données d'un autre : le cloisonnement est garanti par la base, pas seulement par le code.

Référentiel : niveau 2 de l'OWASP ASVS 5.0, avec une liste de contrôle à appliquer à chaque ajout et l'état de l'audit dans `docs/securite.md`.

**Cloisonnement**

- Row Level Security PostgreSQL sur toutes les tables métier, avec l'organisation courante posée en début de transaction.
- Tests automatisés qui tentent d'accéder aux données d'une autre organisation.

Mise en œuvre (J0) :

- Deux rôles PostgreSQL : `app_owner` possède les tables et passe les migrations ; `app_user` sert à l'application, sans droit de contourner la RLS ni de vider une table.
- Chaque table métier a une RLS activée et forcée (`FORCE ROW LEVEL SECURITY`, qui s'applique aussi au propriétaire) et une politique `organisation_id = app_current_organisation_id()`.
- L'API accède aux tables métier par `withOrganisation(db, organisationId, fn)`, qui pose `app.organisation_id` pour la seule transaction en cours. Sans organisation posée, aucune ligne n'est visible.
- Un test vérifie que toute table portant `organisation_id` a une RLS active, forcée et une politique.
- Exception : les tables `member` et `invitation` de Better Auth n'ont pas de RLS, car Better Auth les lit sans organisation posée (par exemple pour lister les organisations d'un utilisateur). Seuls Better Auth et la route `GET /api/invitations/:id` (détail d'une invitation, limité à l'adresse de l'invité connecté) y accèdent ; l'appartenance est relue en base à chaque requête par le garde `requireOrganisation`, pas seulement dans la session.

**Comptes et rôles (J0)**

- Pas d'inscription en libre-service : le produit est vendu sur devis. Une organisation (le compte d'une entreprise cliente) est ouverte par l'éditeur avec `pnpm org:create "<nom>" <e-mail>`, qui crée l'organisation et invite son premier `admin`.
- L'inscription n'est acceptée que pour une adresse ayant une invitation en attente et non expirée. Un utilisateur ne peut pas créer d'organisation lui-même.
- Les invitations de l'éditeur sont envoyées au nom d'un compte technique « opérateur » (`OPERATOR_EMAIL`), sans mot de passe ni appartenance. Comme Better Auth refuse d'afficher une invitation dont l'expéditeur n'est pas membre, la page d'invitation lit son détail par `GET /api/invitations/:id`.
- L'admin d'une organisation invite ensuite ses collaborateurs (`admin` ou `membre`). Invitation valable 7 jours, acceptée uniquement par un compte dont l'adresse est vérifiée et correspond à celle invitée.
- Un même utilisateur peut être membre de plusieurs organisations (par exemple quelqu'un qui intervient dans plusieurs usines clientes) ; il accepte chaque invitation avec le même compte et choisit l'organisation active dans l'en-tête.
- L'inscription demande le prénom et le nom (colonnes `first_name` et `last_name`) ; le nom affiché `name` en est composé (« Prénom Nom »).
- Connexion par e-mail et mot de passe (12 caractères minimum), adresse vérifiée avant toute connexion, puis code TOTP (double authentification obligatoire).
- Connexion par clé d'accès (passkey : déverrouillage de l'ordinateur, du téléphone ou clé de sécurité, sans dépendre d'Apple) : proposée sur l'accueil et sur « Mon compte » une fois la double authentification activée ; elle dispense du mot de passe et du code TOTP, qui reste la solution de secours (détails dans `docs/securite.md`).
- La suppression d'une organisation est désactivée dans l'application : seul l'éditeur peut la faire, à la demande du client (voir « RGPD »).
- Fichiers en stockage privé, servis uniquement par URLs signées à courte durée.

**Liens intervenant**

- Jeton signé, aléatoire, à expiration (30 jours par défaut, réglable), révocable.
- Accès limité aux réserves de l'assignation : lecture et ajout de preuves, rien d'autre.
- Chaque action via le lien est tracée dans le journal d'audit.

**RGPD**

- Le produit est sous-traitant des données de ses clients : contrat de sous-traitance (DPA) dans les conditions générales.
- Sous-traitants ultérieurs listés : hébergeur, Mistral, service e-mail. Tous hébergés dans l'UE.
- Notifications sur le téléphone : elles transitent par le service de notification du navigateur de l'appareil (Apple, Google, Mozilla, Microsoft, hors UE pour certains), choisi par l'utilisateur en activant les notifications. Le contenu est chiffré de bout en bout pour l'appareil et réduit au nom de l'organisation, au site et au nombre de réserves ; à mentionner dans le DPA.
- Pas d'entraînement de modèles sur les données clients.
- Export et suppression des données d'une organisation à sa demande, par l'éditeur :
  - `pnpm org:export <identifiant ou slug>` produit une archive ZIP lisible sans Obsio : chaque table en CSV (point-virgule, UTF-8, pour Excel) et en JSON, les membres sans mot de passe, les fichiers déposés (rapports, plans, photos) et un dossier de preuves par site. `--out -` écrit l'archive sur la sortie standard (conteneur en lecture seule).
  - `pnpm org:delete <identifiant ou slug>` est une simulation (lignes par table, comptes, fichiers) ; elle ne supprime qu'avec `--confirm "<nom exact>"`. Elle passe par le rôle `app_owner`, puisque `app_user` n'a pas le droit de supprimer réserves, preuves et journal ; refuse pendant l'analyse d'un rapport ; supprime en une transaction les données, les membres, les invitations et l'organisation, puis les comptes sans autre organisation (un compte membre ailleurs, ou encore cité par les données d'une autre organisation, est conservé) ; enfin les fichiers du préfixe `organisations/<id>/`. Si la suppression des fichiers échoue, relancer avec l'identifiant termine le travail. La ligne de journal affichée est la seule trace : l'éditeur la conserve dans son registre des demandes.
  - C'est la seule exception à la règle « pas de suppression physique » des réserves, preuves et événements d'audit. Les sauvegardes de la base gardent les données supprimées jusqu'à leur rotation (sept jours).
  - Un test échoue si une table portant `organisation_id` n'est ni exportée ni supprimée (`ORGANISATION_TABLES`, `apps/api/src/organisations/data.ts`).

**Bases**

- HTTPS partout, mots de passe gérés par la brique d'auth, sauvegardes quotidiennes de la base testées en restauration.
- Limitation de débit sur l'API et sur les liens intervenant.

## Backlog par jalons

Sept jalons, chacun livrable et démontrable seul ; l'extraction est attaquée tôt car c'est le risque technique principal.

**J0 — Fondations**

- [x] Monorepo pnpm : `apps/web`, `apps/api`, `apps/worker`, `packages/shared`
- [x] Choix définitif Fastify ou NestJS : Fastify
- [x] PostgreSQL + ORM + migrations, RLS sur une première table (Drizzle, table `site`)
- [x] Auth, organisations, invitations (Better Auth)
- [x] CI : lint, tests, build (GitHub Actions)
- [x] Déploiement d'un environnement de préproduction : images prêtes (`Dockerfile`, cibles `api`, `worker`, `web`), pile complète `deploy/compose.yml` ; en ligne sur https://preprod.obsio.fr (VPS OVH, `deploy/compose.server.yml`, voir `docs/deploiement.md`). Le serveur est hors de l'UE : données de test uniquement, jusqu'au passage sur un serveur européen

**J1 — Jeu de test et extraction (preuve de faisabilité)**

- [x] Récupérer 5 à 10 rapports réels, de plusieurs organismes : 16 rapports publics (préfectures, communes) de 8 organismes, dont 5 comptes rendus Q18 et 5 contrôles Q19, tous en PDF texte ; il manque au moins un rapport scanné
- [x] Écrire le résultat attendu pour chacun (pré-rempli, 113 réserves dont 14 Q18 et 6 Q19 ; 04 et 01 relus)
- [x] Worker BullMQ : OCR Mistral puis extraction structurée, validation Zod (tâche `extract-report`, testée avec un faux fournisseur ; l'enregistrement en base vient en J3)
- [x] Script d'évaluation qui compare extraction et résultat attendu (`eval:extraction`, OCR mis en cache)
- [x] Critère de sortie (validé) : au moins 95 % des réserves retrouvées, aucune réserve inventée, au moins 90 % des descriptions fidèles. Atteint le 1er novembre 2026 avec mistral-ocr-4-1 et mistral-medium-2604 (prompt reserves-v2) : 113 réserves sur 113, aucune inventée, 97,3 % des descriptions fidèles. Le premier passage avait 2 réserves en double, car le modèle avait scindé un compte rendu Q19 en deux documents (synthèse puis fiches) : le worker fusionne désormais les documents de même type et de même numéro (`mergeDuplicateDocuments`). Points faibles à suivre, sur des résultats attendus pas encore tous relus : descriptions Q18 (78,6 %), localisation (64,6 %), nouvelle ou reconduite (32,7 %). La validation humaine reste la parade.

**J2 — Sites, plans, équipements**

- [x] CRUD sites, bâtiments, étages (modification réservée à l'admin, archivage sans suppression)
- [x] Import d'un plan par étage (PDF, page choisie et convertie en image dans le navigateur, ou image), affichage zoomable (Konva) ; calibrage de l'échelle reporté
- [x] Placement et édition des équipements sur le plan (repères en plaques, glisser-déposer, autres noms pour le rapprochement)

**J3 — Import et validation**

- [x] Dépôt du PDF, suivi du statut de l'import
- [x] Écran de validation côte à côte avec surlignage dans le PDF (passage retrouvé dans le texte de la page ; pas de surlignage sur un PDF scanné)
- [x] Rapprochement équipement et détection des reconduites
- [x] Activation des réserves

**J4 — Réserves et assignation**

- [x] Liste, filtres, détail d'une réserve, journal d'audit
- [x] Intervenants, assignations, liens signés, e-mails
- [x] Repères des réserves sur le plan, colorés par statut

**J5 — PWA mobile et preuves**

- [x] Vue intervenant mobile via lien
- [x] Prise de photo, commentaire, statut corrigée
- [x] File d'envoi hors ligne (service worker, IndexedDB) ; à éprouver sur un vrai téléphone en zone sans réseau
- [x] Clôture des réserves par le responsable

**J6 — Pilotage et bêta**

- [x] Tableau de bord par site : ouvertes, en retard, reconduites ; alertes quand le dernier Q18 conclut à un risque d'incendie ou contient des constatations « non vérifié »
- [x] Export PDF du dossier de preuves (généré par l'API avec pdfkit, filtrable par origine et limité aux réserves levées si besoin)
- [x] Notifications de retard
- [ ] Bêta privée avec 2 ou 3 sites réels

**Après le MVP — Échéancier des vérifications**

- [x] Prochaine visite par site et par type (vérification périodique du Code du travail, Q18, Q19) : dernière visite d'après les rapports validés, plus la périodicité ; visite programmée et contact de l'organisme saisis par l'admin ; page « Échéances de contrôle » pour tous les sites (À traiter, Planifiées, par date ; sans rapport et non suivies repliées) et section sur la page du site, même présentation
- [x] Relances e-mail aux admins, avec les relances de retard de 8 h
- Décisions prises, à relire (règles par défaut, faute de règle métier confirmée) :
  - Périodicité proposée : 12 mois pour les trois types, réglable de 1 à 60 mois par site. Un type peut être « non suivi » (par exemple un Q19 que l'assureur n'exige pas).
  - La vérification initiale fait partir l'échéance de la périodique. Seuls les rapports validés et datés comptent.
  - États : à jour ; à programmer (échéance à 60 jours ou moins, sans visite programmée) ; programmée ; rapport à importer (visite programmée passée sans rapport plus récent) ; en retard ; aucun rapport. Une visite programmée ne compte plus dès qu'un rapport plus récent est validé.
  - Relances à jour fixe, sans suivi des envois : 60 et 30 jours avant l'échéance sans visite programmée, le lendemain de l'échéance, 7 jours avant une visite programmée (avec le nombre de réserves de ce type encore en cours, qui seront reconduites) et 7 jours après si le rapport n'est pas importé. Aucun e-mail à l'organisme lui-même.

**Après le MVP — Vue 3D d'un bâtiment**

- [x] Étages empilés selon leur niveau, chacun texturé par l'image de son plan (même largeur pour tous tant que l'échelle n'est pas calibrée), équipements en repères verticaux colorés comme sur le plan 2D (statut le plus urgent, hauteur selon le nombre de réserves, anneau si retard) ; écartement réglable, étage isolable, repère sélectionnable avec ses réserves et le lien vers le plan
- Choix techniques : three.js et React Three Fiber, chargés seulement à l'ouverture de la vue (`/batiments/:id/3d`) ; aucune nouvelle route d'API (étages, plans signés, équipements et réserves existants) ; message de repli sans WebGL. Pas de cloisons extrudées : un plan PDF ou image n'en décrit pas.

**Après le MVP — Réserves confiées à des collaborateurs**

- [x] L'admin confie une ou plusieurs réserves à un ou plusieurs membres de l'organisation (sélection multiple de la liste des réserves, ou fiche d'une réserve), avec échéance et message facultatifs ; e-mail aux collaborateurs nouvellement chargés (sauf à soi-même)
- [x] « Mes réserves » : page et entrée de menu, bandeau sur la liste des sites, filtre dans la liste des réserves d'un site
- [x] Notification sur le téléphone (Web Push) en plus de l'e-mail : « Usine de Lyon : 2 réserves à corriger » (une par site, sans le texte des réserves), le toucher ouvre la réserve ou « Mes réserves » ; activation par appareil sur « Mon compte » et proposée sur « Mes réserves ». Seul cet événement notifie pour l'instant (correction à vérifier, correction refusée et retards possibles ensuite)
- Décisions prises, à relire :
  - Plusieurs collaborateurs par réserve ; la première preuve « corrigée » de l'un d'eux la fait passer à `corrigee`. Cette assignation s'ajoute aux liens intervenant, sans les remplacer.
  - Comme pour un lien, l'échéance donnée devient celle des réserves ; une réserve corrigée ou levée ne peut pas être confiée.
  - Un collaborateur est retiré par l'admin, ou automatiquement quand il quitte l'organisation ; l'assignation est marquée retirée, jamais supprimée, et le journal de la réserve garde chaque ajout et retrait.

**Après le MVP — Tutoriels interactifs**

- [x] Visites guidées courtes sur les vrais éléments de la page (projecteur et bulle d'une phrase), sur l'application et la vue téléphone de l'intervenant : premiers pas, site, liste des réserves, fiche d'une réserve, plan, relecture d'un import, « Mes réserves », compte, intervention
- [x] Rejouables à tout moment depuis le bouton « Tutoriels » de l'en-tête (tutoriels de la page courante), et « Revoir les tutoriels d'accueil » relance les tutoriels automatiques
- Choix techniques : aucun appel à l'API ni donnée en base ; tutoriels vus mémorisés dans le navigateur (`localStorage`, clé `obsio-tutoriels-vus`). Seuls les premiers pas et la vue intervention se lancent seuls, à la première visite. Éléments repérés par l'attribut `data-tour` ; une étape dont l'élément est absent (droits, page vide) est sautée. Une étape « à faire » avance quand l'utilisateur touche l'élément. Bulle en bas de l'écran sur téléphone ; Échap ferme, flèches pour naviguer. Code dans `apps/web/src/tours/`.

**Après le MVP — Navigation**

- [x] Ordinateur : menu latéral, avec en bas une ligne « Mon compte » explicite (initiales, nom).
- [x] Téléphone : barre d'onglets en bas de l'écran (Mes réserves, Sites, Échéances, Plus) ; « Plus » ouvre un volet avec Mon compte, Organisation, Tutoriels, le choix de l'organisation et la déconnexion. En haut, le logo seul.

- [x] Plus d'onglet « Intervenants » : les électriciens externes sont dans la page Organisation, sous les membres, avec pour chacun le suivi de ce qui lui est confié (réserves en cours, en retard, corrigées à vérifier, lien expiré ; route `GET /api/contractors/reserves`). `/intervenants` redirige vers `/organisation`.

**Après le MVP — Échelle des étages**

- [x] Calibrage par l'admin : deux points cliqués sur une longueur connue du plan (cote, porte, mur), puis la longueur réelle ; l'échelle est stockée en mètres par pixel de l'image (`floor.scale`) et effacée quand le plan est remplacé
- [x] Barre d'échelle sur le plan, ajustée au zoom, et état « calibrée » dans le cartouche ; outil « Mesurer » pour tout membre une fois l'échelle connue
- [x] Vue 3D en vrais mètres quand tous les plans du bâtiment sont calibrés ; sinon largeur commune, pour ne pas mêler des étages à des échelles différentes

## Risques et questions ouvertes

Le risque principal est l'accès à de vrais rapports : sans eux, l'extraction ne peut être ni construite ni évaluée.

| Risque | Conséquence | Parade |
| --- | --- | --- |
| Pas assez de rapports réels | Extraction optimisée sur un seul format | Solliciter anciens collègues et électriciens dès J0, sans rien vendre |
| Formats très variables selon l'organisme | Taux d'extraction insuffisant | Jeu de test multi-organismes, validation humaine systématique |
| Rapports scannés de mauvaise qualité | OCR dégradé | Mesurer en J1 ; service OCR dédié plus tard si besoin |
| Responsabilité en cas de réserve manquée | Litige client | Validation humaine obligatoire, mention dans les conditions générales |
| Concurrence des registres généralistes | Argument « on a déjà un outil » | Profondeur électrique, import automatique, boucle avec l'électricien |
| Temps disponible limité (M2, alternance) | Projet qui s'étire | Jalons courts et démontrables, périmètre MVP tenu |

**Questions ouvertes**

- Quel modèle Mistral pour l'extraction (taille, coût) ? À trancher sur le jeu de test.
- Une anomalie Q19 de priorité 3 (« à surveiller ») est-elle une réserve à lever, ou une simple information ? L'extraction la reprend dans tous les cas.
- Quel modèle de prix : par site, par bâtiment ou par nombre de réserves suivies ?
- Qui paie en priorité : l'entreprise utilisatrice ou l'entreprise d'électricité qui l'offre à ses clients ?
- Durée de conservation des rapports et des preuves après résiliation ?
