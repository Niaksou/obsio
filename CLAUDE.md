# CLAUDE.md

## Le projet

**Obsio** : SaaS de suivi des vérifications électriques réglementaires : import du rapport PDF annuel de l'organisme de contrôle (Code du travail, et comptes rendus Q18 et Q19 demandés par l'assureur), extraction automatique des réserves (non-conformités), suivi jusqu'à leur levée, localisation sur le plan du bâtiment, preuves de correction apportées par l'électricien depuis son téléphone.

La spécification complète est dans `docs/SPEC.md`. Lis-la avant de commencer un jalon, et réfère-toi à elle pour toute question fonctionnelle ou d'architecture.

## Façon de travailler

- On avance **jalon par jalon** (J0 à J6, voir la section « Backlog par jalons » de la spec). Ne commence jamais un jalon qui n'a pas été demandé.
- Avant de coder un jalon ou une fonctionnalité non triviale, **propose un plan** et attends ma validation.
- Petits changements cohérents, un commit par étape, messages de commit en français.
- Si une décision d'architecture change, **mets à jour `docs/SPEC.md` et ce fichier** dans le même changement.
- En cas de doute fonctionnel, pose la question plutôt que d'inventer une règle métier.
- Interface utilisateur, messages et documentation en français. Code (noms de variables, fonctions, fichiers) en anglais, sauf les noms d'entités métier déjà définis dans la spec s'ils sont conservés tels quels.

## Stack

- TypeScript partout, monorepo **pnpm workspaces** :
  - `apps/web` : React + Vite, PWA (service worker, IndexedDB), Konva pour le plan 2D
  - `apps/api` : Node.js, Fastify (routes validées par Zod), Better Auth (plugin organisation)
  - `apps/worker` : worker BullMQ pour l'extraction des rapports
  - `packages/shared` : types et schémas Zod partagés entre front, API et worker ; rôles Better Auth dans `@obsio/shared/permissions`
- PostgreSQL 17 + Drizzle, avec **Row Level Security** : accès aux tables métier uniquement via `withOrganisation()` (`apps/api/src/db/client.ts`)
- Redis pour BullMQ
- Stockage objet compatible S3 (RustFS en local : MinIO ne publie plus d'images Docker)
- Extraction : **Mistral OCR** puis modèle Mistral en sortie structurée, derrière une interface `ExtractionProvider`
- Développement local via `docker compose` (PostgreSQL sur le port 5433, Redis, RustFS, Mailpit)

## Règles non négociables

- **Cloisonnement multi-client** : chaque table métier porte `organisation_id` et est protégée par RLS (politique `organisationIsolation()` dans le schéma Drizzle **et** `FORCE ROW LEVEL SECURITY` ajouté à la main dans la migration). Toute nouvelle table doit l'être aussi, avec un test qui vérifie qu'une organisation ne voit pas les données d'une autre. Le test `apps/api/test/rls.test.ts` échoue si une table portant `organisation_id` n'est pas protégée.
- **Validation humaine** : une réserve extraite par l'IA n'est jamais activée sans validation par un utilisateur.
- **Toute sortie de LLM est validée par un schéma Zod** avant d'être utilisée ou stockée.
- **Traçabilité des extractions** : on stocke versions des modèles, version du prompt et sortie brute.
- **Pas de suppression physique** des réserves, preuves et événements d'audit.
- **Aucun secret dans le dépôt** : variables d'environnement, avec un `.env.example` à jour.
- Les rapports PDF de test (dossier `fixtures/reports/`) sont des documents réels : ce dossier est dans `.gitignore`.

## Commandes

Prérequis : Node 24+, pnpm 9, Docker.

```sh
cp .env.example .env            # puis remplacer BETTER_AUTH_SECRET (openssl rand -base64 32)
pnpm install
docker compose up -d --wait     # PostgreSQL, Redis, RustFS, Mailpit
pnpm --filter @obsio/api db:migrate
pnpm dev                        # API :3000, front :5173, worker
```

- Ouvrir un client (pas d'inscription libre) : `pnpm org:create "Usine Dupont" responsable@dupont.fr`
- Jeu de test d'extraction : PDF et résultats attendus dans `fixtures/reports/` (hors dépôt) ; `pnpm --filter @obsio/worker fixtures:check` les valide
- Évaluation de l'extraction (appelle Mistral, `MISTRAL_API_KEY` requise) : `pnpm --filter @obsio/worker eval:extraction [--only <motif>] [--model <id>] [--no-cache]` ; OCR mis en cache dans `fixtures/reports/.cache/`, résultats et synthèse dans `fixtures/reports/.runs/`
- Tests : `pnpm test` (services docker démarrés ; l'API utilise la base `obsio_test`, migrée automatiquement)
- Vérifications : `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm build`
- Nouvelle migration : modifier `apps/api/src/db/schema/`, puis `pnpm --filter @obsio/api db:generate` ; relire le SQL généré et y ajouter `FORCE ROW LEVEL SECURITY` pour toute nouvelle table métier
- E-mails envoyés en local : http://localhost:8025 (Mailpit) ; console du stockage : http://localhost:9001
