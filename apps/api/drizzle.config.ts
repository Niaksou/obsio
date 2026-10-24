import { defineConfig } from 'drizzle-kit';

try {
  process.loadEnvFile('../../.env');
} catch {
  // Pas de fichier .env : variables fournies par l'environnement.
}

// Les migrations s'exécutent avec le rôle propriétaire des tables.
const url = process.env.DATABASE_OWNER_URL;
if (!url) throw new Error('DATABASE_OWNER_URL doit être défini');

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dbCredentials: { url },
  strict: true,
});
