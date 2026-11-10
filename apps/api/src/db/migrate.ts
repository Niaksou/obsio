import { fileURLToPath, pathToFileURL } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

// Même chemin relatif depuis src/db et dist/db.
const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));

export async function runMigrations(ownerConnectionString: string): Promise<void> {
  const pool = new pg.Pool({ connectionString: ownerConnectionString, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder });
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { ownerDatabaseUrl } = await import('../config.js');
  await runMigrations(ownerDatabaseUrl());
  console.log('Migrations appliquées');
}
