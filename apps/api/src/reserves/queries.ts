import type { ReserveFilters, ReserveListItem, ReserveStatus } from '@obsio/shared';
import { and, desc, eq, gt, inArray, isNull, notExists, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Transaction } from '../db/client.js';
import {
  assignment,
  assignmentReserve,
  building,
  contractor,
  equipment,
  floor,
  proof,
  reportDocument,
  reserve,
  reserveEvent,
  reserveSource,
  user,
} from '../db/schema/index.js';
import type { Storage } from '../storage.js';

// Lectures des réserves, partagées par l'API, l'export du dossier de preuves et le tableau de bord.

/** Date du jour (AAAA-MM-JJ) dans le fuseau des sites : on compare des dates sans heure. */
export function today(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
}

export function isOverdue(status: ReserveStatus, dueDate: string | null, on = today()) {
  return (status === 'ouverte' || status === 'assignee') && dueDate !== null && dueDate < on;
}

/** Une réserve reconduite par une réserve d'un import suivant sort des listes en cours. */
export function notSuperseded(tx: Transaction) {
  const successor = alias(reserve, 'successor');
  return notExists(
    tx.select({ id: successor.id }).from(successor).where(eq(successor.reconduiteDeId, reserve.id)),
  );
}

/** Assignation en cours de chaque réserve : la plus récente, ni révoquée ni expirée. */
export async function currentAssignments(tx: Transaction, reserveIds: string[]) {
  type Current = { assignmentId: string; name: string; company: string | null };
  if (reserveIds.length === 0) return new Map<string, Current>();
  const rows = await tx
    .selectDistinctOn([assignmentReserve.reserveId], {
      reserveId: assignmentReserve.reserveId,
      assignmentId: assignment.id,
      name: contractor.name,
      company: contractor.company,
    })
    .from(assignmentReserve)
    .innerJoin(assignment, eq(assignment.id, assignmentReserve.assignmentId))
    .innerJoin(contractor, eq(contractor.id, assignment.contractorId))
    .where(
      and(
        inArray(assignmentReserve.reserveId, reserveIds),
        isNull(assignment.revokedAt),
        gt(assignment.expiresAt, new Date()),
      ),
    )
    .orderBy(assignmentReserve.reserveId, desc(assignment.createdAt));
  return new Map(rows.map((row) => [row.reserveId, row]));
}

const listColumns = {
  reserve,
  equipment: {
    id: equipment.id,
    name: equipment.name,
    floorId: equipment.floorId,
    x: equipment.x,
    y: equipment.y,
  },
  floorName: floor.name,
  buildingName: building.name,
};

export async function listReserves(
  tx: Transaction,
  siteId: string,
  filters: ReserveFilters = {},
  /** Consultation directe de réserves précises, reconduites comprises. */
  only?: string[],
): Promise<ReserveListItem[]> {
  const on = today();
  const conditions: SQL[] = [eq(reserve.siteId, siteId)];
  if (only) conditions.push(inArray(reserve.id, only));
  else conditions.push(notSuperseded(tx));
  if (filters.status) conditions.push(eq(reserve.status, filters.status));
  if (filters.open === 'true') conditions.push(sql`${reserve.status} <> 'levee'`);
  if (filters.overdue === 'true') {
    conditions.push(
      sql`${reserve.status} in ('ouverte', 'assignee') and ${reserve.dueDate} < ${on}`,
    );
  }
  if (filters.equipmentId) conditions.push(eq(reserve.equipmentId, filters.equipmentId));
  if (filters.floorId) conditions.push(eq(equipment.floorId, filters.floorId));
  if (filters.documentType) {
    conditions.push(
      sql`exists (select 1 from ${reserveSource} join ${reportDocument} on ${reportDocument.id} = ${reserveSource.documentId} where ${reserveSource.reserveId} = ${reserve.id} and ${reportDocument.type} = ${filters.documentType})`,
    );
  }

  const rows = await tx
    .select(listColumns)
    .from(reserve)
    .leftJoin(equipment, eq(equipment.id, reserve.equipmentId))
    .leftJoin(floor, eq(floor.id, equipment.floorId))
    .leftJoin(building, eq(building.id, floor.buildingId))
    .where(and(...conditions))
    .orderBy(sql`${reserve.dueDate} asc nulls last`, desc(reserve.createdAt));

  const ids = rows.map((row) => row.reserve.id);
  const sources = ids.length
    ? await tx
        .select({
          reserveId: reserveSource.reserveId,
          documentType: reportDocument.type,
          reference: reserveSource.reference,
        })
        .from(reserveSource)
        .innerJoin(reportDocument, eq(reportDocument.id, reserveSource.documentId))
        .where(inArray(reserveSource.reserveId, ids))
        .orderBy(reportDocument.position)
    : [];
  const assignments = await currentAssignments(tx, ids);

  return rows.map(({ reserve: r, equipment: e, floorName, buildingName }) => ({
    id: r.id,
    siteId: r.siteId,
    description: r.description,
    preconisation: r.preconisation,
    gravite: r.gravite,
    status: r.status,
    dueDate: r.dueDate,
    overdue: isOverdue(r.status, r.dueDate, on),
    reconduite: r.reconduiteDeId !== null,
    equipment: e
      ? {
          id: e.id,
          name: e.name,
          floorId: e.floorId,
          floorName: floorName ?? '',
          buildingName: buildingName ?? '',
          position: e.x !== null && e.y !== null ? { x: e.x, y: e.y } : null,
        }
      : null,
    sources: sources
      .filter((source) => source.reserveId === r.id)
      .map(({ documentType, reference }) => ({ documentType, reference })),
    assignedTo: (() => {
      const current = assignments.get(r.id);
      return current ? { name: current.name, company: current.company } : null;
    })(),
    createdAt: r.createdAt.toISOString(),
  }));
}

/** Preuves d'une réserve, avec des liens de lecture signés pour les photos. */
export async function reserveProofs(tx: Transaction, storage: Storage, reserveIds: string[]) {
  if (reserveIds.length === 0) return [];
  const rows = await tx
    .select({ proof, userName: user.name, contractorName: contractor.name })
    .from(proof)
    .leftJoin(user, eq(user.id, proof.authorUserId))
    .leftJoin(contractor, eq(contractor.id, proof.authorContractorId))
    .where(inArray(proof.reserveId, reserveIds))
    .orderBy(proof.createdAt);
  return Promise.all(
    rows.map(async (row) => ({
      reserveId: row.proof.reserveId,
      id: row.proof.id,
      comment: row.proof.comment,
      photoKeys: row.proof.photoKeys,
      photos: await Promise.all(
        row.proof.photoKeys.map(async (key) => ({ url: await storage.signedDownloadUrl(key) })),
      ),
      author: row.userName ?? row.contractorName ?? 'Inconnu',
      createdAt: row.proof.createdAt.toISOString(),
    })),
  );
}

export async function reserveDetail(tx: Transaction, storage: Storage, id: string) {
  const row = await tx.query.reserve.findFirst({ where: eq(reserve.id, id) });
  if (!row) return null;
  const [item] = await listReserves(tx, row.siteId, {}, [id]);
  if (!item) return null;

  const sources = await tx
    .select({ source: reserveSource, document: reportDocument })
    .from(reserveSource)
    .innerJoin(reportDocument, eq(reportDocument.id, reserveSource.documentId))
    .where(eq(reserveSource.reserveId, id))
    .orderBy(reportDocument.position);

  const events = await tx
    .select({ event: reserveEvent, userName: user.name, contractorName: contractor.name })
    .from(reserveEvent)
    .leftJoin(user, eq(user.id, reserveEvent.actorUserId))
    .leftJoin(contractor, eq(contractor.id, reserveEvent.actorContractorId))
    .where(eq(reserveEvent.reserveId, id))
    .orderBy(reserveEvent.createdAt);

  const assignments = await tx
    .select({ assignment, contractor })
    .from(assignmentReserve)
    .innerJoin(assignment, eq(assignment.id, assignmentReserve.assignmentId))
    .innerJoin(contractor, eq(contractor.id, assignment.contractorId))
    .where(eq(assignmentReserve.reserveId, id))
    .orderBy(desc(assignment.createdAt));

  // Historique : on remonte la chaîne des reconduites.
  const history: { id: string; description: string; status: ReserveStatus; createdAt: string }[] =
    [];
  let previousId = row.reconduiteDeId;
  while (previousId && history.length < 20) {
    const previous = await tx.query.reserve.findFirst({ where: eq(reserve.id, previousId) });
    if (!previous) break;
    history.push({
      id: previous.id,
      description: previous.description,
      status: previous.status,
      createdAt: previous.createdAt.toISOString(),
    });
    previousId = previous.reconduiteDeId;
  }

  return {
    ...item,
    sources: sources.map(({ source, document }) => ({
      id: source.id,
      importId: document.importId,
      documentType: document.type,
      organisme: document.organisme,
      dateVisite: document.dateVisite,
      origin: source.origin,
      reference: source.reference,
      codeObservation: source.codeObservation,
      description: source.description,
      preconisation: source.preconisation,
      articleReglementaire: source.articleReglementaire,
      localisationTexte: source.localisationTexte,
      gravite: source.gravite,
      pageSource: source.pageSource,
      constatationQ18: source.constatationQ18,
      thermique: source.thermique ?? null,
    })),
    events: events.map(({ event, userName, contractorName }) => ({
      id: event.id,
      type: event.type,
      createdAt: event.createdAt.toISOString(),
      actor: userName ?? contractorName ?? null,
      data: event.data,
    })),
    proofs: (await reserveProofs(tx, storage, [id])).map(
      ({ reserveId: _r, photoKeys: _k, ...proofItem }) => proofItem,
    ),
    assignments: assignments.map(({ assignment: a, contractor: c }) => ({
      id: a.id,
      contractor: { id: c.id, name: c.name, company: c.company },
      dueDate: a.dueDate,
      expiresAt: a.expiresAt.toISOString(),
      revokedAt: a.revokedAt?.toISOString() ?? null,
      createdAt: a.createdAt.toISOString(),
    })),
    history,
  };
}
