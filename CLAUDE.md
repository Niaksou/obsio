# CLAUDE.md

## Le projet

SaaS de suivi des vérifications électriques réglementaires : import du rapport PDF annuel de l'organisme de contrôle, extraction automatique des réserves (non-conformités), suivi jusqu'à leur levée, localisation sur le plan du bâtiment, preuves de correction apportées par l'électricien depuis son téléphone.

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
  - `apps/api` : Node.js, Fastify ou NestJS (choix à faire en J0)
  - `apps/worker` : worker BullMQ pour l'extraction des rapports
  - `packages/shared` : types et schémas Zod partagés entre front, API et worker
- PostgreSQL + Drizzle ou Prisma (choix à faire en J0), avec **Row Level Security**
- Redis pour BullMQ
- Stockage objet compatible S3 (MinIO en local)
- Extraction : **Mistral OCR** puis modèle Mistral en sortie structurée, derrière une interface `ExtractionProvider`
- Développement local via `docker compose` (PostgreSQL, Redis, MinIO)

## Règles non négociables

- **Cloisonnement multi-client** : chaque table métier porte `organisation_id` et est protégée par RLS. Toute nouvelle table doit l'être aussi, avec un test qui vérifie qu'une organisation ne voit pas les données d'une autre.
- **Validation humaine** : une réserve extraite par l'IA n'est jamais activée sans validation par un utilisateur.
- **Toute sortie de LLM est validée par un schéma Zod** avant d'être utilisée ou stockée.
- **Traçabilité des extractions** : on stocke versions des modèles, version du prompt et sortie brute.
- **Pas de suppression physique** des réserves, preuves et événements d'audit.
- **Aucun secret dans le dépôt** : variables d'environnement, avec un `.env.example` à jour.
- Les rapports PDF de test (dossier `fixtures/reports/`) sont des documents réels : ce dossier est dans `.gitignore`.

## Commandes

À compléter en J0 une fois le monorepo en place (installation, lancement en local, tests, lint, migrations).
