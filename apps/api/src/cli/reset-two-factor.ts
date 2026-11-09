import { parseArgs } from 'node:util';
import { resetTwoFactor } from '../auth/reset-two-factor.js';
import { loadConfig } from '../config.js';
import { createDatabase } from '../db/client.js';

// Double authentification perdue (téléphone et codes de secours) : pnpm user:reset-2fa <e-mail>
const { positionals } = parseArgs({ allowPositionals: true });
const [email] = positionals;
if (!email) {
  console.error('Usage : pnpm user:reset-2fa <e-mail du compte>');
  process.exit(1);
}

const config = loadConfig();
const { pool, db } = createDatabase(config.DATABASE_URL);
try {
  const found = await resetTwoFactor(db, email);
  if (!found) {
    console.error(`Aucun compte ${email}.`);
    process.exitCode = 1;
  } else {
    console.log(`Double authentification de ${found.name} réinitialisée, sessions fermées.`);
    console.log('À sa prochaine connexion, il ou elle configurera une nouvelle application.');
  }
} finally {
  await pool.end();
}
