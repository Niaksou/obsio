import { defaultLicence, parisDate, type Licence } from '@obsio/shared';
import { eq, sql } from 'drizzle-orm';
import type { ApiConfig } from '../config.js';
import type { Database } from '../db/client.js';
import { invitation, organisation, user } from '../db/schema/index.js';
import type { EmailSender } from '../email/sender.js';
import { saveLicence } from '../licences/licence.js';
import { INVITATION_TTL_SECONDS, sendInvitation } from './invitations.js';

export interface ProvisionDependencies {
  config: ApiConfig;
  db: Database;
  emailSender: EmailSender;
}

function slugify(name: string): string {
  const base = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${base || 'organisation'}-${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * Ouvre un nouveau client : crée l'organisation, sa licence (standard sans échéance par défaut)
 * et invite son premier administrateur.
 * Les organisations ne sont créées que par ce moyen (pas d'inscription en libre-service).
 */
export async function provisionOrganisation(
  { config, db, emailSender }: ProvisionDependencies,
  input: { name: string; adminEmail: string; licence?: Licence },
) {
  const email = input.adminEmail.trim().toLowerCase();
  const created = await db.transaction(async (tx) => {
    // L'opérateur est l'expéditeur des invitations : il n'a ni mot de passe ni appartenance.
    await tx
      .insert(user)
      .values({ email: config.OPERATOR_EMAIL, name: config.OPERATOR_NAME })
      .onConflictDoNothing({ target: user.email });
    const [operator] = await tx
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, config.OPERATOR_EMAIL));

    const [newOrganisation] = await tx
      .insert(organisation)
      .values({ name: input.name.trim(), slug: slugify(input.name) })
      .returning();
    // La licence est une table métier : écrite dans le contexte de la nouvelle organisation.
    await tx.execute(sql`select set_config('app.organisation_id', ${newOrganisation!.id}, true)`);
    await saveLicence(tx, newOrganisation!.id, input.licence ?? defaultLicence(parisDate()));
    const [newInvitation] = await tx
      .insert(invitation)
      .values({
        organisationId: newOrganisation!.id,
        email,
        role: 'admin',
        status: 'pending',
        expiresAt: new Date(Date.now() + INVITATION_TTL_SECONDS * 1000),
        inviterId: operator!.id,
      })
      .returning();
    return { organisation: newOrganisation!, invitation: newInvitation! };
  });

  await sendInvitation(
    { config, emailSender },
    {
      id: created.invitation.id,
      email,
      inviterName: config.OPERATOR_NAME,
      organisationName: created.organisation.name,
    },
  );
  return created;
}
