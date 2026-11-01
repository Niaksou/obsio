import { asc, eq } from 'drizzle-orm';
import type { Transaction } from '../db/client.js';
import {
  draftReserve,
  reportImport,
  reserve,
  reserveEvent,
  reserveSource,
} from '../db/schema/index.js';

type DraftRow = typeof draftReserve.$inferSelect;

export class ActivationError extends Error {
  override name = 'ActivationError';
}

/**
 * Validation d'un import par l'utilisateur : chaque brouillon retenu devient une réserve active,
 * ou une source de plus d'une autre réserve s'il signale la même anomalie dans un autre document.
 * Tous les brouillons doivent avoir été relus (retenus ou écartés).
 */
export async function activateImport(
  tx: Transaction,
  importRow: typeof reportImport.$inferSelect,
  userId: string,
): Promise<number> {
  const drafts = await tx
    .select()
    .from(draftReserve)
    .where(eq(draftReserve.importId, importRow.id))
    .orderBy(asc(draftReserve.position));
  const pending = drafts.filter((draft) => draft.decision === 'a_valider').length;
  if (pending > 0) {
    throw new ActivationError(
      `${pending} réserve${pending > 1 ? 's' : ''} à relire avant de valider l'import.`,
    );
  }

  const byId = new Map(drafts.map((draft) => [draft.id, draft]));
  // Cible d'un regroupement : un brouillon retenu qui n'est pas lui-même regroupé.
  const target = (draft: DraftRow) => {
    const into = draft.mergeIntoId ? byId.get(draft.mergeIntoId) : undefined;
    return into && into.decision === 'retenue' && !into.mergeIntoId ? into : null;
  };
  const retained = drafts.filter((draft) => draft.decision === 'retenue');
  const reserveOf = new Map<string, string>();

  for (const draft of retained.filter((d) => !target(d))) {
    const [created] = await tx
      .insert(reserve)
      .values({
        organisationId: importRow.organisationId,
        siteId: importRow.siteId,
        importId: importRow.id,
        equipmentId: draft.equipmentId,
        description: draft.description,
        preconisation: draft.preconisation,
        gravite: draft.gravite,
        reconduiteDeId: draft.reconduiteDeId,
      })
      .returning({ id: reserve.id });
    reserveOf.set(draft.id, created!.id);
    await tx.insert(reserveEvent).values({
      organisationId: importRow.organisationId,
      reserveId: created!.id,
      type: 'creee',
      actorUserId: userId,
      data: { importId: importRow.id, reconduiteDeId: draft.reconduiteDeId },
    });
    if (draft.reconduiteDeId) {
      await tx.insert(reserveEvent).values({
        organisationId: importRow.organisationId,
        reserveId: draft.reconduiteDeId,
        type: 'reconduite',
        actorUserId: userId,
        data: { importId: importRow.id, reserveId: created!.id },
      });
    }
  }

  for (const draft of retained) {
    const reserveId = reserveOf.get(target(draft)?.id ?? draft.id)!;
    const { extracted } = draft;
    await tx.insert(reserveSource).values({
      organisationId: importRow.organisationId,
      reserveId,
      documentId: draft.documentId,
      origin: draft.origin,
      reference: extracted.reference,
      codeObservation: extracted.codeObservation,
      description: extracted.description,
      preconisation: extracted.preconisation,
      articleReglementaire: extracted.articleReglementaire,
      localisationTexte: extracted.localisationTexte,
      gravite: extracted.gravite,
      pageSource: extracted.pageSource,
      constatationQ18: extracted.constatationQ18,
      thermique: extracted.thermique,
    });
    await tx.update(draftReserve).set({ reserveId }).where(eq(draftReserve.id, draft.id));
  }

  await tx
    .update(reportImport)
    .set({ status: 'valide', validatedAt: new Date(), validatedBy: userId })
    .where(eq(reportImport.id, importRow.id));
  return reserveOf.size;
}
