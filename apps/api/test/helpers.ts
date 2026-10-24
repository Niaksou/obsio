import pg from 'pg';
import { loadConfig, type ApiConfig } from '../src/config.js';
import type { Database } from '../src/db/client.js';
import { organisation } from '../src/db/schema/index.js';

/** Configuration de test : base saas_test à la place de la base de développement. */
export function testConfig(): ApiConfig {
  const { TEST_DATABASE_URL } = process.env;
  if (!TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL doit être défini pour les tests');
  return loadConfig({ ...process.env, NODE_ENV: 'test', DATABASE_URL: TEST_DATABASE_URL });
}

/** Vide toutes les tables avec le rôle propriétaire (app_user n'a pas le droit TRUNCATE). */
export async function resetDatabase(): Promise<void> {
  const { TEST_DATABASE_OWNER_URL } = process.env;
  if (!TEST_DATABASE_OWNER_URL) throw new Error('TEST_DATABASE_OWNER_URL doit être défini');
  const client = new pg.Client({ connectionString: TEST_DATABASE_OWNER_URL });
  await client.connect();
  try {
    const { rows } = await client.query<{ tablename: string }>(
      "select tablename from pg_tables where schemaname = 'public'",
    );
    if (rows.length === 0) return;
    const tables = rows.map((row) => `"${row.tablename}"`).join(', ');
    await client.query(`truncate ${tables} cascade`);
  } finally {
    await client.end();
  }
}

export async function createOrganisation(db: Database, name: string) {
  const [created] = await db
    .insert(organisation)
    .values({ name, slug: `${name.toLowerCase()}-${crypto.randomUUID()}` })
    .returning();
  if (!created) throw new Error('Organisation non créée');
  return created;
}
