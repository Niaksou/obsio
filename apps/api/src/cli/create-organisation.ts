import { parseArgs } from 'node:util';
import { loadConfig } from '../config.js';
import { createDatabase } from '../db/client.js';
import { createSmtpSender } from '../email/sender.js';
import { provisionOrganisation } from '../organisations/provision.js';

// Ouvre un client : pnpm org:create "Usine Dupont" responsable@dupont.fr
const { positionals } = parseArgs({ allowPositionals: true });
const [name, adminEmail] = positionals;
if (!name || !adminEmail) {
  console.error('Usage : pnpm org:create "<nom de l\'organisation>" <e-mail du premier admin>');
  process.exit(1);
}

const config = loadConfig();
const { pool, db } = createDatabase(config.DATABASE_URL);
try {
  const { organisation, invitation } = await provisionOrganisation(
    { config, db, emailSender: createSmtpSender(config) },
    { name, adminEmail },
  );
  console.log(`Organisation « ${organisation.name} » créée (${organisation.id}).`);
  console.log(`Invitation administrateur envoyée à ${invitation.email}.`);
} finally {
  await pool.end();
}
