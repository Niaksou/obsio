import { parseArgs } from 'node:util';
import { loadConfig } from '../config.js';
import { createDatabase } from '../db/client.js';
import { DEMO_SUFFIX, seedConsoleDemo } from '../demo/console.js';
import { DemoError } from '../demo/seed.js';

// Clients fictifs pour voir la console Obsio remplie :
//   pnpm demo:console [--force]   (--force exigé quand NODE_ENV=production, en préproduction)
const { values } = parseArgs({ options: { force: { type: 'boolean', default: false } } });

if (process.env.NODE_ENV === 'production' && !values.force) {
  console.error(
    'NODE_ENV=production : ajouter --force pour créer des clients fictifs (préproduction seulement).',
  );
  process.exit(1);
}

const config = loadConfig();
const { pool, db } = createDatabase(config.DATABASE_URL);
try {
  const summary = await seedConsoleDemo(db);
  console.log(
    `${summary.clients} clients fictifs créés (noms finissant par « ${DEMO_SUFFIX.trim()} ») : ${summary.analyses} analyses, ${summary.pageViews} pages vues.`,
  );
  console.log('Pour les retirer : pnpm org:delete <slug> puis --confirm "<nom exact>".');
} catch (error) {
  if (!(error instanceof DemoError)) throw error;
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
