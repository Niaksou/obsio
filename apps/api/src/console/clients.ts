import {
  defaultLicence,
  licenceAccess,
  parisDate,
  ONBOARDING_STEPS,
  type ConsoleClient,
  type Licence,
  type OnboardingStep,
} from '@obsio/shared';
import { and, asc, count, eq, gt, isNotNull, isNull, max, sql } from 'drizzle-orm';
import { withOrganisation, type Database } from '../db/client.js';
import {
  assignment,
  equipment,
  floor,
  invitation,
  member,
  organisation,
  reportImport,
  reserve,
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
        failures: sql<number>`(count(*) filter (where ${reportImport.status} = 'erreur'))::int`,
        ocrPages: sql<number>`coalesce(sum((${reportImport.trace} -> 'usage' ->> 'ocrPages')::int), 0)::int`,
      })
      .from(reportImport)
      .where(sql`${reportImport.createdAt} >= ${startOfMonth}`);
    return {
      licence,
      sites: sites!.total,
      analysesThisMonth: month!.analyses,
      failedAnalysesThisMonth: month!.failures,
      ocrPagesThisMonth: month!.ocrPages,
    };
  });
}

/** Clients, ou seulement celui demandé. */
export async function listClients(db: Database, only?: string): Promise<ConsoleClient[]> {
  const organisations = await db
    .select()
    .from(organisation)
    .where(only ? eq(organisation.id, only) : undefined)
    .orderBy(asc(organisation.name));
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

/** Étapes du démarrage franchies par le client : de quoi voir où il bloque. */
export function onboarding(db: Database, organisationId: string, members: number) {
  return withOrganisation(db, organisationId, async (tx) => {
    const exists = async (query: Promise<{ total: number }[]>) =>
      ((await query)[0]?.total ?? 0) > 0;
    const done: Record<OnboardingStep, boolean> = {
      site: await exists(tx.select({ total: count() }).from(site)),
      plan: await exists(
        tx.select({ total: count() }).from(floor).where(isNotNull(floor.planImageKey)),
      ),
      equipement_place: await exists(
        tx.select({ total: count() }).from(equipment).where(isNotNull(equipment.x)),
      ),
      rapport_importe: await exists(tx.select({ total: count() }).from(reportImport)),
      rapport_valide: await exists(
        tx.select({ total: count() }).from(reportImport).where(eq(reportImport.status, 'valide')),
      ),
      equipe_invitee: members > 1,
      electricien_assigne: await exists(tx.select({ total: count() }).from(assignment)),
      reserve_levee: await exists(
        tx.select({ total: count() }).from(reserve).where(eq(reserve.status, 'levee')),
      ),
    };
    return ONBOARDING_STEPS.map((step) => ({ step, done: done[step] }));
  });
}
