import { parseArgs } from 'node:util';
import { loadConfig } from '../config.js';
import { createDatabase } from '../db/client.js';
import { DemoError, seedDemo } from '../demo/seed.js';
import { createStorage } from '../storage.js';

// Remplit une organisation vide avec des données de démonstration :
//   pnpm demo:seed responsable@exemple.fr [--organisation <id>]
const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { organisation: { type: 'string' } },
});
const [adminEmail] = positionals;
if (!adminEmail) {
  console.error('Usage : pnpm demo:seed <e-mail de l’admin> [--organisation <id>]');
  process.exit(1);
}

const config = loadConfig();
const { pool, db } = createDatabase(config.DATABASE_URL);
const storage = createStorage(config);
try {
  const summary = await seedDemo(
    { db, storage, webUrl: config.WEB_URL },
    { adminEmail, organisationId: values.organisation },
  );
  console.log(
    `Démonstration prête dans « ${summary.organisationName} » : ${summary.sites} sites, ${summary.reserves} réserves.`,
  );
  console.log('Liens d’intervention (vue téléphone de l’électricien) :');
  for (const link of summary.links) console.log(`  ${link.contractor} : ${link.url}`);
} catch (error) {
  if (!(error instanceof DemoError)) throw error;
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
  storage.close();
}
