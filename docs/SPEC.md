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

- Vue 3D par extrusion des plans (React Three Fiber).
- Import BIM (IFC) et détection automatique des murs.
- Autres vérifications périodiques : incendie, levage, gaz, portes automatiques.
- Planning des prochaines visites et relances de l'organisme de contrôle.
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

Hébergement : PaaS en France (Scaleway, Clever Cloud ou OVH), sans Kubernetes au départ.
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
| Extraction | Mistral OCR + modèle Mistral en sortie structurée | Hébergé dans l'UE, bon sur les tableaux |
| Auth | Better Auth (plugin organisation) ; jetons signés pour les intervenants | Organisations, rôles et invitations fournis ; pas de compte pour l'électricien |
| E-mail | Fournisseur transactionnel hébergé dans l'UE (à choisir) | Notifications et envoi des liens |
| Hébergement | PaaS en France (Scaleway, Clever Cloud ou OVH) | Peu d'exploitation, argument RGPD |

## Pipeline d'extraction (Mistral)

L'extraction propose, l'utilisateur valide : aucune réserve ne devient active sans relecture humaine.

1. **Dépôt.** L'API stocke le PDF sous `organisations/{organisation}/imports/{import}/rapport.pdf` (`reportImportKeys`), crée un `ImportRapport` au statut `en_analyse` et enfile une tâche BullMQ `extract-report`.
2. **OCR.** Le worker appelle Mistral OCR avec une version de modèle figée (OCR 4 ou plus, pour les blocs classés et leurs positions dans la page). Sortie : markdown par page, tableaux en HTML, blocs positionnés.
3. **Extraction.** Le texte part vers un modèle Mistral en sortie structurée (schéma JSON). Sortie : en-tête du rapport (organisme, date, site) et liste des réserves.
4. **Validation technique.** Zod valide le JSON ; en cas d'échec, une nouvelle tentative, puis statut `erreur` visible par l'utilisateur.
5. **Rapprochement.** Pour chaque réserve : proposition d'équipement à partir de `localisation_texte`, et détection des reconduites par comparaison avec les réserves ouvertes du site.
6. **Brouillon.** Les réserves sont stockées en `ReserveBrouillon`, statut de l'import `a_valider`.
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
| `Equipement` | type (TGBT, TD, éclairage de sécurité…), repère (« TD2 »), position x/y sur le plan, alias textuels | placé sur un étage ; porte des réserves |
| `RapportVerification` | organisme, date de visite, type de document (`periodique`, `initiale`, `q18`, `q19`), numéro, fichier PDF ; pour un Q18, état des 8 constatations standard et conclusion ; pour un Q19, nombre d'anomalies par priorité | concerne un site ; produit des réserves (un PDF importé peut contenir plusieurs documents) |
| `ImportRapport` | statut (`en_analyse`, `a_valider`, `valide`, `erreur`), versions modèles et prompt, sortie brute | un par rapport importé |
| `ReserveBrouillon` | champs extraits, confiance, équipement proposé | appartient à un import ; devient une réserve |
| `Reserve` | description, gravité, statut (`ouverte`, `assignee`, `corrigee`, `levee`), échéance, reconduite de | liée à un équipement ; a une ou plusieurs sources |
| `SourceReserve` | document (rapport du Code du travail, Q18, Q19), référence, code d'observation, texte, article, page, constatation Q18, relevé thermique | relie une réserve à chaque document qui la signale |
| `Intervenant` | nom, société, e-mail | externe à l'organisation |
| `Assignation` | réserves, intervenant, échéance, jeton signé, expiration | donne accès aux réserves assignées |
| `Preuve` | photo(s), commentaire, date, auteur | jointe à une réserve |
| `Evenement` | type, auteur, date, avant/après | journal d'audit de chaque réserve |

**Règles notables**

- Chaque table porte `organisation_id`, filtré par Row Level Security.
- `Reserve.reconduite_de` pointe vers la réserve de l'année précédente : c'est elle qui donne l'historique d'un équipement.
- Une anomalie signalée dans plusieurs documents (rapport du Code du travail et Q18, par exemple) est **une seule réserve avec plusieurs sources** : l'électricien la corrige une fois, une seule preuve la lève pour toutes ses sources, et l'export se filtre par origine (dossier pour l'assureur, dossier réglementaire). Le rapprochement est proposé automatiquement (même code d'observation, sinon texte et localisation proches) et confirmé par l'utilisateur à la validation.
- Q18 : chaque point de non-conformité est une source ; une constatation standard cochée en danger sans point rattaché est proposée comme réserve à la validation (texte de la constatation), jamais créée par l'IA.
- `Equipement.alias` (« TD2 », « tableau atelier ») améliore le rapprochement automatique au fil des imports.
- Rien n'est supprimé physiquement : une réserve levée reste consultable, et le journal `Evenement` sert de preuve.

## Sécurité, multi-tenant et RGPD

Un client ne doit jamais voir les données d'un autre : le cloisonnement est garanti par la base, pas seulement par le code.

**Cloisonnement**

- Row Level Security PostgreSQL sur toutes les tables métier, avec l'organisation courante posée en début de transaction.
- Tests automatisés qui tentent d'accéder aux données d'une autre organisation.

Mise en œuvre (J0) :

- Deux rôles PostgreSQL : `app_owner` possède les tables et passe les migrations ; `app_user` sert à l'application, sans droit de contourner la RLS ni de vider une table.
- Chaque table métier a une RLS activée et forcée (`FORCE ROW LEVEL SECURITY`, qui s'applique aussi au propriétaire) et une politique `organisation_id = app_current_organisation_id()`.
- L'API accède aux tables métier par `withOrganisation(db, organisationId, fn)`, qui pose `app.organisation_id` pour la seule transaction en cours. Sans organisation posée, aucune ligne n'est visible.
- Un test vérifie que toute table portant `organisation_id` a une RLS active, forcée et une politique.
- Exception : les tables `member` et `invitation` de Better Auth n'ont pas de RLS, car Better Auth les lit sans organisation posée (par exemple pour lister les organisations d'un utilisateur). Seul Better Auth y accède ; l'appartenance est relue en base à chaque requête par le garde `requireOrganisation`, pas seulement dans la session.

**Comptes et rôles (J0)**

- Pas d'inscription en libre-service : le produit est vendu sur devis. Une organisation (le compte d'une entreprise cliente) est ouverte par l'éditeur avec `pnpm org:create "<nom>" <e-mail>`, qui crée l'organisation et invite son premier `admin`.
- L'inscription n'est acceptée que pour une adresse ayant une invitation en attente et non expirée. Un utilisateur ne peut pas créer d'organisation lui-même.
- Les invitations de l'éditeur sont envoyées au nom d'un compte technique « opérateur » (`OPERATOR_EMAIL`), sans mot de passe ni appartenance.
- L'admin d'une organisation invite ensuite ses collaborateurs (`admin` ou `membre`). Invitation valable 7 jours, acceptée uniquement par un compte dont l'adresse est vérifiée et correspond à celle invitée.
- Un même utilisateur peut être membre de plusieurs organisations (par exemple quelqu'un qui intervient dans plusieurs usines clientes) ; il accepte chaque invitation avec le même compte et choisit l'organisation active dans l'en-tête.
- Connexion par e-mail et mot de passe (12 caractères minimum), adresse vérifiée avant toute connexion.
- La suppression d'une organisation est désactivée.
- Fichiers en stockage privé, servis uniquement par URLs signées à courte durée.

**Liens intervenant**

- Jeton signé, aléatoire, à expiration (30 jours par défaut, réglable), révocable.
- Accès limité aux réserves de l'assignation : lecture et ajout de preuves, rien d'autre.
- Chaque action via le lien est tracée dans le journal d'audit.

**RGPD**

- Le produit est sous-traitant des données de ses clients : contrat de sous-traitance (DPA) dans les conditions générales.
- Sous-traitants ultérieurs listés : hébergeur, Mistral, service e-mail. Tous hébergés dans l'UE.
- Pas d'entraînement de modèles sur les données clients.
- Export et suppression des données d'une organisation à sa demande.

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
- [ ] Déploiement d'un environnement de préproduction

**J1 — Jeu de test et extraction (preuve de faisabilité)**

- [x] Récupérer 5 à 10 rapports réels, de plusieurs organismes : 16 rapports publics (préfectures, communes) de 8 organismes, dont 5 comptes rendus Q18 et 5 contrôles Q19, tous en PDF texte ; il manque au moins un rapport scanné
- [x] Écrire le résultat attendu pour chacun (pré-rempli, 113 réserves dont 14 Q18 et 6 Q19 ; 04 et 01 relus)
- [x] Worker BullMQ : OCR Mistral puis extraction structurée, validation Zod (tâche `extract-report`, testée avec un faux fournisseur ; l'enregistrement en base vient en J3)
- [ ] Script d'évaluation qui compare extraction et résultat attendu (écrit, pas encore lancé : l'offre gratuite de Mistral n'ouvre ni l'OCR ni mistral-medium)
- [ ] Critère de sortie (validé) : au moins 95 % des réserves retrouvées, aucune réserve inventée, au moins 90 % des descriptions fidèles

**J2 — Sites, plans, équipements**

- [ ] CRUD sites, bâtiments, étages
- [ ] Import d'un plan par étage, affichage zoomable (Konva)
- [ ] Placement et édition des équipements sur le plan

**J3 — Import et validation**

- [ ] Dépôt du PDF, suivi du statut de l'import
- [ ] Écran de validation côte à côte avec surlignage dans le PDF
- [ ] Rapprochement équipement et détection des reconduites
- [ ] Activation des réserves

**J4 — Réserves et assignation**

- [ ] Liste, filtres, détail d'une réserve, journal d'audit
- [ ] Intervenants, assignations, liens signés, e-mails
- [ ] Repères des réserves sur le plan, colorés par statut

**J5 — PWA mobile et preuves**

- [ ] Vue intervenant mobile via lien
- [ ] Prise de photo, commentaire, statut corrigée
- [ ] File d'envoi hors ligne (service worker, IndexedDB)
- [ ] Clôture des réserves par le responsable

**J6 — Pilotage et bêta**

- [ ] Tableau de bord par site : ouvertes, en retard, reconduites ; alertes quand le dernier Q18 conclut à un risque d'incendie ou contient des constatations « non vérifié »
- [ ] Export PDF du dossier de preuves
- [ ] Notifications de retard
- [ ] Bêta privée avec 2 ou 3 sites réels

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
