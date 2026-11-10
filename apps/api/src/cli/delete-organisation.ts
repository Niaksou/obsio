import { parseArgs } from 'node:util';
import { loadConfig, ownerDatabaseUrl } from '../config.js';
import { createDatabase } from '../db/client.js';
import { createExtractionQueue } from '../imports/queue.js';
import { findOrganisation, isUuid } from '../organisations/data.js';
import {
  DeletionError,
  deleteOrganisation,
  planOrganisationDeletion,
} from '../organisations/delete.js';
import { createRedis } from '../redis.js';
import { createStorage } from '../storage.js';

// Supprime définitivement un client, à sa demande (simulation sans --confirm) :
//   pnpm org:delete <identifiant ou slug> [--confirm "<nom exact de l'organisation>"]
// Si l'organisation n'est plus en base mais que des fichiers restent (suppression interrompue),
// relancer avec son identifiant et --confirm <identifiant>.
const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { confirm: { type: 'string' } },
});
const [target] = positionals;
if (!target) {
  console.error(
    'Usage : pnpm org:delete <identifiant ou slug> [--confirm "<nom exact de l’organisation>"]',
  );
  process.exit(1);
}
// Rôle propriétaire : l'application n'a pas le droit de supprimer réserves, preuves et journal.
const ownerUrl = ownerDatabaseUrl();

const config = loadConfig();
const { pool, db } = createDatabase(ownerUrl);
const storage = createStorage(config);
const redis = createRedis(config.REDIS_URL);
const queue = createExtractionQueue(redis);
try {
  const found = await findOrganisation(db, target);
  const organisationId = found?.id ?? target;
  const plan = isUuid(organisationId)
    ? await planOrganisationDeletion({ db, storage }, organisationId)
    : null;
  const expected = plan?.organisation?.name ?? organisationId;

  if (!plan || (!plan.organisation && plan.files === 0)) {
    console.error(`Aucune organisation « ${target} », ni aucun fichier à son nom.`);
    process.exitCode = 1;
  } else {
    if (plan.organisation) {
      console.log(`Organisation « ${plan.organisation.name} » (${plan.organisation.id})`);
      for (const [table, rows] of Object.entries(plan.tables)) {
        console.log(`  ${table.padEnd(20)} ${rows}`);
      }
      console.log(`Comptes supprimés : ${plan.usersToDelete.join(', ') || 'aucun'}`);
      console.log(
        `Comptes conservés (autre organisation) : ${plan.usersToKeep.join(', ') || 'aucun'}`,
      );
    } else {
      console.log(`Organisation ${organisationId} déjà supprimée de la base.`);
    }
    console.log(`Fichiers : ${plan.files} (${(plan.bytes / 1e6).toFixed(1)} Mo)`);

    if (values.confirm === undefined) {
      console.log('\nSimulation : rien n’a été supprimé. Pour supprimer définitivement :');
      console.log(`  pnpm org:delete ${organisationId} --confirm "${expected}"`);
    } else if (values.confirm !== expected) {
      console.error(`\nConfirmation refusée : attendu exactement « ${expected} ».`);
      process.exitCode = 1;
    } else {
      const result = await deleteOrganisation({ db, storage, queue }, organisationId);
      const rows = Object.values(result.tables).reduce((sum, value) => sum + value, 0);
      // Seule trace de la suppression : à conserver par l'éditeur (registre des demandes RGPD).
      console.log(
        `\n${new Date().toISOString()} suppression de « ${expected} » (${organisationId}) : ${rows} lignes, ${result.files} fichiers, comptes supprimés : ${result.usersDeleted.join(', ') || 'aucun'}.`,
      );
      if (result.usersKept.length > 0) {
        console.log(
          `Comptes conservés car cités par une autre organisation : ${result.usersKept.join(', ')}.`,
        );
      }
    }
  }
} catch (error) {
  if (!(error instanceof DeletionError)) throw error;
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await Promise.all([pool.end(), queue.close()]);
  await redis.quit();
  storage.close();
}
