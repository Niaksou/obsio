import { and, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import type { Database, Transaction } from '../db/client.js';
import { withOrganisation } from '../db/client.js';
import { member, reserve, reserveMember, site, user } from '../db/schema/index.js';
import { recordEvent } from './events.js';
import { currentAssignments, listReserves, notSuperseded } from './queries.js';

// Collaborateurs : membres de l'organisation chargés de corriger des réserves (plusieurs par
// réserve). Une réserve est « assignée » tant qu'un lien intervenant ou un collaborateur est en
// cours ; le premier qui la marque corrigée la fait passer à « corrigée ».

export type Collaborator = { id: string; name: string };

/** Collaborateurs en cours de chaque réserve, par ordre d'assignation puis par nom. */
export async function activeCollaborators(tx: Transaction, reserveIds: string[]) {
  const byReserve = new Map<string, Collaborator[]>();
  if (reserveIds.length === 0) return byReserve;
  const rows = await tx
    .select({ reserveId: reserveMember.reserveId, id: user.id, name: user.name })
    .from(reserveMember)
    .innerJoin(user, eq(user.id, reserveMember.userId))
    .where(and(inArray(reserveMember.reserveId, reserveIds), isNull(reserveMember.removedAt)))
    .orderBy(reserveMember.createdAt, user.name);
  for (const { reserveId, ...collaborator } of rows) {
    byReserve.set(reserveId, [...(byReserve.get(reserveId) ?? []), collaborator]);
  }
  return byReserve;
}

/** Réserves encore confiées à quelqu'un : lien intervenant en cours ou collaborateur. */
export async function stillAssigned(tx: Transaction, reserveIds: string[]) {
  const assigned = new Set((await currentAssignments(tx, reserveIds)).keys());
  for (const id of (await activeCollaborators(tx, reserveIds)).keys()) assigned.add(id);
  return assigned;
}

/** Une réserve assignée qui n'est plus confiée à personne redevient ouverte. */
async function reopenUnassigned(tx: Transaction, reserveIds: string[]) {
  const assigned = await stillAssigned(tx, reserveIds);
  const free = reserveIds.filter((id) => !assigned.has(id));
  if (free.length === 0) return;
  await tx
    .update(reserve)
    .set({ status: 'ouverte' })
    .where(and(inArray(reserve.id, free), eq(reserve.status, 'assignee')));
}

/** Membres de l'organisation parmi `userIds` (nom et adresse). */
export async function organisationMembers(
  tx: Transaction,
  organisationId: string,
  userIds: string[],
) {
  return tx
    .select({ id: user.id, name: user.name, firstName: user.firstName, email: user.email })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(and(eq(member.organisationId, organisationId), inArray(member.userId, userIds)));
}

export async function assignCollaborators(
  tx: Transaction,
  input: {
    organisationId: string;
    actorUserId: string;
    userIds: string[];
    reserveIds: string[];
    dueDate: string | null;
  },
) {
  const { organisationId, actorUserId, dueDate } = input;
  const userIds = [...new Set(input.userIds)];
  const reserveIds = [...new Set(input.reserveIds)];
  const people = (await organisationMembers(tx, organisationId, userIds)).sort((a, b) =>
    a.name.localeCompare(b.name, 'fr'),
  );
  if (people.length !== userIds.length) return 'Collaborateur introuvable dans l’organisation.';
  const reserves = await tx.select().from(reserve).where(inArray(reserve.id, reserveIds));
  if (reserves.length !== reserveIds.length) return 'Réserve introuvable.';
  if (reserves.some((r) => r.status === 'levee' || r.status === 'corrigee')) {
    return 'Une réserve corrigée ou levée ne peut pas être assignée.';
  }

  const current = await activeCollaborators(tx, reserveIds);
  // Collaborateurs nouvellement chargés d'au moins une réserve : ils reçoivent un e-mail.
  const notified = new Map<string, { person: (typeof people)[number]; reserveIds: string[] }>();
  for (const r of reserves) {
    const already = new Set((current.get(r.id) ?? []).map((c) => c.id));
    const added = people.filter((p) => !already.has(p.id));
    if (added.length === 0 && !dueDate) continue;
    if (added.length > 0) {
      await tx.insert(reserveMember).values(
        added.map((p) => ({
          organisationId,
          reserveId: r.id,
          userId: p.id,
          assignedBy: actorUserId,
        })),
      );
    }
    await tx
      .update(reserve)
      .set({ status: 'assignee', ...(dueDate ? { dueDate } : {}) })
      .where(eq(reserve.id, r.id));
    for (const p of added) {
      await recordEvent(tx, {
        organisationId,
        reserveId: r.id,
        type: 'collaborateur_assigne',
        actorUserId,
        data: {
          userId: p.id,
          collaborator: p.name,
          dueDate,
          before: { status: r.status, dueDate: r.dueDate },
        },
      });
      const entry = notified.get(p.id) ?? { person: p, reserveIds: [] };
      entry.reserveIds.push(r.id);
      notified.set(p.id, entry);
    }
  }
  return { notified: [...notified.values()] };
}

/** Retire un collaborateur d'une réserve ; false s'il n'en était pas chargé. */
export async function removeCollaborator(
  tx: Transaction,
  input: { organisationId: string; actorUserId: string | null; reserveId: string; userId: string },
) {
  const [removed] = await tx
    .update(reserveMember)
    .set({ removedAt: new Date(), removedBy: input.actorUserId })
    .where(
      and(
        eq(reserveMember.reserveId, input.reserveId),
        eq(reserveMember.userId, input.userId),
        isNull(reserveMember.removedAt),
      ),
    )
    .returning();
  if (!removed) return false;
  const [person] = await tx.select({ name: user.name }).from(user).where(eq(user.id, input.userId));
  await recordEvent(tx, {
    organisationId: input.organisationId,
    reserveId: input.reserveId,
    type: 'collaborateur_retire',
    actorUserId: input.actorUserId,
    data: { userId: input.userId, collaborator: person?.name ?? null },
  });
  await reopenUnassigned(tx, [input.reserveId]);
  return true;
}

/** Au retrait d'un membre de l'organisation, ses assignations en cours prennent fin. */
export async function endCollaboratorAssignments(
  db: Database,
  organisationId: string,
  userId: string,
) {
  await withOrganisation(db, organisationId, async (tx) => {
    const rows = await tx
      .select({ reserveId: reserveMember.reserveId })
      .from(reserveMember)
      .where(and(eq(reserveMember.userId, userId), isNull(reserveMember.removedAt)));
    for (const { reserveId } of rows) {
      await removeCollaborator(tx, { organisationId, actorUserId: null, reserveId, userId });
    }
  });
}

/** Identifiants des réserves en cours (ni levées ni reconduites) confiées à un utilisateur. */
export function reservesOf(userId: string) {
  return sql`exists (select 1 from ${reserveMember} where ${reserveMember.reserveId} = ${reserve.id} and ${reserveMember.userId} = ${userId} and ${reserveMember.removedAt} is null)`;
}

/** Réserves en cours confiées à un utilisateur, tous sites actifs confondus. */
export async function myReserves(tx: Transaction, userId: string) {
  const rows = await tx
    .select({ id: reserve.id, siteId: site.id, siteName: site.name })
    .from(reserve)
    .innerJoin(site, eq(site.id, reserve.siteId))
    .where(
      and(
        reservesOf(userId),
        ne(reserve.status, 'levee'),
        notSuperseded(tx),
        isNull(site.archivedAt),
      ),
    );
  const bySite = new Map<string, { siteName: string; ids: string[] }>();
  for (const row of rows) {
    const entry = bySite.get(row.siteId) ?? { siteName: row.siteName, ids: [] };
    entry.ids.push(row.id);
    bySite.set(row.siteId, entry);
  }
  const items = [];
  for (const [siteId, { siteName, ids }] of bySite) {
    for (const item of await listReserves(tx, siteId, {}, ids)) items.push({ ...item, siteName });
  }
  // Les plus urgentes d'abord : échéance la plus proche, sans échéance à la fin.
  return items.sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'));
}

// --- Ce que voit un collaborateur (rôle) : les réserves qui lui sont ou lui ont été confiées.

/** Condition SQL : réserve confiée à l'utilisateur, en ce moment ou par le passé. */
export function everAssignedTo(userId: string) {
  return sql`exists (select 1 from ${reserveMember} where ${reserveMember.reserveId} = ${reserve.id} and ${reserveMember.userId} = ${userId})`;
}

/**
 * Le collaborateur peut-il voir cette réserve (`write` : y agir, seulement tant qu'elle lui
 * est confiée) ?
 */
export async function collaboratorCanReach(
  tx: Transaction,
  userId: string,
  reserveId: string,
  write = false,
) {
  const [row] = await tx
    .select({ id: reserveMember.id })
    .from(reserveMember)
    .where(
      and(
        eq(reserveMember.reserveId, reserveId),
        eq(reserveMember.userId, userId),
        write ? isNull(reserveMember.removedAt) : undefined,
      ),
    )
    .limit(1);
  return Boolean(row);
}

/** Réserves d'un site visibles par le collaborateur. */
export async function collaboratorReserveIds(tx: Transaction, userId: string, siteId: string) {
  const rows = await tx
    .select({ id: reserve.id })
    .from(reserve)
    .where(and(eq(reserve.siteId, siteId), everAssignedTo(userId)));
  return rows.map((r) => r.id);
}
