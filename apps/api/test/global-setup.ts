import { runMigrations } from '../src/db/migrate.js';

export default async function setup() {
  const url = process.env.TEST_DATABASE_OWNER_URL;
  if (!url) throw new Error('TEST_DATABASE_OWNER_URL doit être défini pour les tests');
  await runMigrations(url);
}
