import type { ContractorReserve } from '@obsio/shared';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import type { Transaction } from '../db/client.js';
import { assignment, assignmentReserve, reserve, site } from '../db/schema/index.js';
import { isOverdue, notSuperseded, today } from './queries.js';

/**
 * Suivi des électriciens externes : pour chaque réserve assignée ou corrigée (non levée), le
 * dernier lien non révoqué qui la concerne, et donc l'électricien qui en a la charge.
 */
export async function contractorReserves(tx: Transaction): Promise<ContractorReserve[]> {
  const rows = await tx
    .selectDistinctOn([assignmentReserve.reserveId], {
      reserveId: assignmentReserve.reserveId,
      contractorId: assignment.contractorId,
      expiresAt: assignment.expiresAt,
      description: reserve.description,
      status: reserve.status,
      dueDate: reserve.dueDate,
      siteId: site.id,
      siteName: site.name,
    })
    .from(assignmentReserve)
    .innerJoin(assignment, eq(assignment.id, assignmentReserve.assignmentId))
    .innerJoin(reserve, eq(reserve.id, assignmentReserve.reserveId))
    .innerJoin(site, eq(site.id, reserve.siteId))
    .where(
      and(
        isNull(assignment.revokedAt),
        inArray(reserve.status, ['assignee', 'corrigee']),
        notSuperseded(tx),
        isNull(site.archivedAt),
      ),
    )
    .orderBy(assignmentReserve.reserveId, desc(assignment.createdAt));

  const on = today();
  const now = new Date();
  return rows
    .map((row) => ({
      contractorId: row.contractorId,
      reserveId: row.reserveId,
      description: row.description,
      siteId: row.siteId,
      siteName: row.siteName,
      status: row.status as 'assignee' | 'corrigee',
      dueDate: row.dueDate,
      overdue: isOverdue(row.status, row.dueDate, on),
      linkExpired: row.expiresAt <= now,
    }))
    .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'));
}
