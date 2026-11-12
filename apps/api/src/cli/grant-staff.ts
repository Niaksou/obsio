import { parseArgs } from 'node:util';
import { ownerDatabaseUrl } from '../config.js';
import { setStaff } from '../console/staff.js';
import { createDatabase } from '../db/client.js';

// Équipe Obsio : pnpm staff:grant <e-mail> [--revoke]
// Rôle propriétaire de la base : l'application elle-même ne peut pas attribuer ce statut.
const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { revoke: { type: 'boolean', default: false } },
});
const [email] = positionals;
if (!email) {
  console.error('Usage : pnpm staff:grant <e-mail> [--revoke]');
  process.exit(1);
}

const { pool, db } = createDatabase(ownerDatabaseUrl());
try {
  const found = await setStaff(db, email, !values.revoke);
  if (values.revoke) {
    console.log(`${email} ne fait plus partie de l'équipe Obsio.`);
  } else {
    console.log(`${email} fait partie de l'équipe Obsio : console sur /console.`);
    console.log("Elle s'ouvre avec une clé d'accès, à ajouter dans Mon compte si besoin.");
    if (!found.twoFactorEnabled) console.log('Attention : double authentification non activée.');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
