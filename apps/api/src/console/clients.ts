import {
  defaultLicence,
  licenceAccess,
  parisDate,
  type ConsoleClient,
  type Licence,
} from '@obsio/shared';
import { and, asc, count, eq, gt, isNull, max, sql } from 'drizzle-orm';
import { withOrganisation, type Database } from '../db/client.js';
import {
  invitation,
  member,
  organisation,
  reportImport,
  session,
  site,
} from '../db/schema/index.js';
import { toLicence } from '../licences/licence.js';

// Clients vus depuis la console : licence et compteurs. Les tables métier sont lues
// organisation par organisation, sous la RLS, et seulement par agrégats.

const startOfMonth = sql`date_trunc('month', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris'`;

async function byOrganisation<V>(rows: Promise<{ organisationId: string; value: V }[]>) {
  return new Map((await rows).map((row) => [row.organisationId, row.value]));
}

/** Compteurs d'une organisation, lus dans son propre contexte RLS. */
function organisationFigures(db: Database, org: { id: string; createdAt: Date }) {
  return withOrganisation(db, org.id, async (tx) => {
    const row = await tx.query.licence.findFirst();
    // Client ouvert avant les licences : la licence par défaut court depuis son ouverture.
    const licence = row ? toLicence(row) : defaultLicence(parisDate(org.createdAt));
    const [sites] = await tx.select({ total: count() }).from(site).where(isNull(site.archivedAt));
    const [month] = await tx
      .select({
        analyses: count(),
        ocrPages: sql<number>`coalesce(sum((${reportImport.trace} -> 'usage' ->> 'ocrPages')::int), 0)::int`,
      })
      .from(reportImport)
      .where(sql`${reportImport.createdAt} >= ${startOfMonth}`);
    return {
      licence,
      sites: sites!.total,
      analysesThisMonth: month!.analyses,
      ocrPagesThisMonth: month!.ocrPages,
    };
  });
}

export async function listClients(db: Database): Promise<ConsoleClient[]> {
  const organisations = await db.select().from(organisation).orderBy(asc(organisation.name));
  const members = await byOrganisation(
    db
      .select({ organisationId: member.organisationId, value: count() })
      .from(member)
      .groupBy(member.organisationId),
  );
  const pending = await byOrganisation(
    db
      .select({ organisationId: invitation.organisationId, value: count() })
      .from(invitation)
      .where(and(eq(invitation.status, 'pending'), gt(invitation.expiresAt, new Date())))
      .groupBy(invitation.organisationId),
  );
  const logins = await byOrganisation(
    db
      .select({ organisationId: member.organisationId, value: max(session.createdAt) })
      .from(member)
      .innerJoin(session, eq(session.userId, member.userId))
      .groupBy(member.organisationId),
  );

  const clients: ConsoleClient[] = [];
  for (const org of organisations) {
    const figures = await organisationFigures(db, org);
    const lastLogin = logins.get(org.id);
    clients.push({
      id: org.id,
      name: org.name,
      slug: org.slug,
      createdAt: org.createdAt.toISOString(),
      ...figures,
      access: licenceAccess(figures.licence),
      members: members.get(org.id) ?? 0,
      pendingInvitations: pending.get(org.id) ?? 0,
      lastLoginAt: lastLogin ? lastLogin.toISOString() : null,
    });
  }
  return clients;
}

/** Champs de la licence qui changent, pour le journal de la console. */
export function licenceChanges(before: Licence, after: Licence) {
  const changes: Record<string, { avant: unknown; apres: unknown }> = {};
  for (const key of Object.keys(after) as (keyof Licence)[]) {
    if (before[key] !== after[key]) changes[key] = { avant: before[key], apres: after[key] };
  }
  return changes;
}

/** Nom de l'action journalisée pour un changement de licence. */
export function licenceAction(before: Licence, after: Licence) {
  if (before.status === after.status) return 'licence.modifiee';
  if (after.status === 'active') return 'licence.reactivee';
  return after.status === 'suspendue' ? 'licence.suspendue' : 'licence.revoquee';
}
