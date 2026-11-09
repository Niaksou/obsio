import { PROOF_PHOTO_TYPES, proofPhotoPrefix, type ProofInput } from '@obsio/shared';
import { eq } from 'drizzle-orm';
import type { Transaction } from '../db/client.js';
import { proof, reserve } from '../db/schema/index.js';
import type { Storage } from '../storage.js';
import { recordEvent } from './events.js';
import { verifiedContentType } from '../file-signature.js';

export type ProofAuthor = { userId: string } | { contractorId: string; assignmentId: string };

export class ProofError extends Error {
  override name = 'ProofError';
}

/** Les photos doivent venir d'un envoi signé pour cette réserve et être arrivées au stockage. */
export async function checkPhotos(
  storage: Storage,
  organisationId: string,
  reserveId: string,
  keys: string[],
) {
  const prefix = proofPhotoPrefix(organisationId, reserveId);
  for (const key of keys) {
    if (!key.startsWith(prefix)) throw new ProofError('Photo étrangère à la réserve.');
    const type = await verifiedContentType(storage, key);
    if (!type || !(PROOF_PHOTO_TYPES as readonly string[]).includes(type)) {
      throw new ProofError('Photo introuvable : renvoyez-la.');
    }
  }
}

/**
 * Ajoute une preuve et, si demandé, passe la réserve au statut « corrigée ». Rejouer le même
 * envoi (même clientId, file hors ligne) ne crée rien de plus.
 */
export async function addProof(
  tx: Transaction,
  organisationId: string,
  reserveId: string,
  input: ProofInput,
  author: ProofAuthor,
): Promise<{ created: boolean; corrected: boolean }> {
  const existing = await tx.query.proof.findFirst({ where: eq(proof.clientId, input.clientId) });
  if (existing) {
    if (existing.reserveId !== reserveId) throw new ProofError('Envoi déjà utilisé.');
    return { created: false, corrected: false };
  }
  const target = await tx.query.reserve.findFirst({ where: eq(reserve.id, reserveId) });
  if (!target) throw new ProofError('Réserve introuvable.');
  if (!input.comment && input.photoKeys.length === 0) {
    throw new ProofError('Ajoutez une photo ou un commentaire.');
  }

  const actor =
    'userId' in author
      ? { actorUserId: author.userId }
      : { actorContractorId: author.contractorId };
  const [created] = await tx
    .insert(proof)
    .values({
      organisationId,
      reserveId,
      clientId: input.clientId,
      comment: input.comment,
      photoKeys: input.photoKeys,
      ...('userId' in author
        ? { authorUserId: author.userId }
        : { authorContractorId: author.contractorId, assignmentId: author.assignmentId }),
    })
    .returning({ id: proof.id });
  await recordEvent(tx, {
    organisationId,
    reserveId,
    type: 'preuve',
    ...actor,
    data: { proofId: created!.id, photos: input.photoKeys.length, comment: input.comment },
  });

  const corrected =
    input.markCorrected && (target.status === 'ouverte' || target.status === 'assignee');
  if (corrected) {
    await tx.update(reserve).set({ status: 'corrigee' }).where(eq(reserve.id, reserveId));
    await recordEvent(tx, {
      organisationId,
      reserveId,
      type: 'corrigee',
      ...actor,
      data: { before: target.status },
    });
  }
  return { created: true, corrected };
}
