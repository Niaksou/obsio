import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema/index.js';

export function createDatabase(connectionString: string) {
  const pool = new pg.Pool({ connectionString });
  const db = drizzle(pool, { schema });
  return { pool, db };
}

export type Database = ReturnType<typeof createDatabase>['db'];
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * Exécute fn dans une transaction où la RLS ne laisse voir que les données de l'organisation.
 * C'est le seul point d'accès prévu aux tables métier.
 */
export function withOrganisation<T>(
  db: Database,
  organisationId: string,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.organisation_id', ${organisationId}, true)`);
    return fn(tx);
  });
}
