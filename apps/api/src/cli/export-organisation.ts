import { once } from 'node:events';
import { createWriteStream } from 'node:fs';
import { finished } from 'node:stream/promises';
import { parseArgs } from 'node:util';
import { loadConfig } from '../config.js';
import { createDatabase } from '../db/client.js';
import { findOrganisation } from '../organisations/data.js';
import { exportOrganisation } from '../organisations/export.js';
import { createStorage } from '../storage.js';

// Exporte les données d'un client, à sa demande :
//   pnpm org:export <identifiant ou slug> [--out archive.zip]
// Avec --out -, l'archive part sur la sortie standard (conteneur en lecture seule) :
//   docker compose ... exec -T api node dist/cli/export-organisation.js <id> --out - > export.zip
const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { out: { type: 'string' } },
});
const [target] = positionals;
if (!target) {
  console.error('Usage : pnpm org:export <identifiant ou slug> [--out archive.zip]');
  process.exit(1);
}

const config = loadConfig();
const { pool, db } = createDatabase(config.DATABASE_URL);
const storage = createStorage(config);
try {
  const organisation = await findOrganisation(db, target);
  if (!organisation) {
    console.error(`Aucune organisation « ${target} ».`);
    process.exitCode = 1;
  } else {
    const day = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
    const path = values.out ?? `obsio-export-${organisation.slug}-${day}.zip`;
    const output = path === '-' ? process.stdout : createWriteStream(path);
    // Chemin invalide : erreur immédiate, avant de lire la base et le stockage.
    if (output !== process.stdout) await once(output, 'open');
    const summary = await exportOrganisation({ db, storage }, organisation, output);
    if (output !== process.stdout) {
      output.end();
      await finished(output);
    }
    const rows = Object.values(summary.tables).reduce((sum, count) => sum + count, 0);
    // Sur la sortie d'erreur : la sortie standard peut porter l'archive.
    console.error(
      `Export de « ${organisation.name} » : ${rows} lignes, ${summary.files} fichiers, ${summary.dossiers} dossiers de preuves${path === '-' ? '' : `, dans ${path}`}.`,
    );
  }
} finally {
  await pool.end();
  storage.close();
}
