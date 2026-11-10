import { and, eq } from 'drizzle-orm';
import type { ApiConfig } from '../config.js';
import type { Database, Transaction } from '../db/client.js';
import { member, reserveEvent, user } from '../db/schema/index.js';
import type { EmailSender } from '../email/sender.js';
import { correctionEmail } from '../email/templates.js';

/** Types d'événements du journal d'audit d'une réserve. */
export type ReserveEventType =
  | 'creee'
  | 'reconduite'
  | 'modifiee'
  | 'commentaire'
  | 'assignee'
  | 'assignation_revoquee'
  | 'collaborateur_assigne'
  | 'collaborateur_retire'
  | 'preuve'
  | 'corrigee'
  | 'levee'
  | 'correction_refusee';

export async function recordEvent(
  tx: Transaction,
  event: {
    organisationId: string;
    reserveId: string;
    type: ReserveEventType;
    actorUserId?: string | null;
    actorContractorId?: string | null;
    data?: Record<string, unknown>;
  },
) {
  await tx.insert(reserveEvent).values({
    organisationId: event.organisationId,
    reserveId: event.reserveId,
    type: event.type,
    actorUserId: event.actorUserId ?? null,
    actorContractorId: event.actorContractorId ?? null,
    data: event.data ?? {},
  });
}

/** Adresses des administrateurs de l'organisation (destinataires des notifications). */
export async function adminEmails(db: Database, organisationId: string): Promise<string[]> {
  const rows = await db
    .select({ email: user.email })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(and(eq(member.organisationId, organisationId), eq(member.role, 'admin')));
  return rows.map((row) => row.email);
}

/** Prévient les admins qu'une réserve est indiquée corrigée (à appeler après la transaction). */
export async function notifyCorrection(
  deps: { db: Database; emailSender: EmailSender; config: Pick<ApiConfig, 'WEB_URL'> },
  organisationId: string,
  reserveId: string,
  author: string,
  description: string,
) {
  const url = `${deps.config.WEB_URL}/reserves/${reserveId}`;
  for (const to of await adminEmails(deps.db, organisationId)) {
    await deps.emailSender.send(correctionEmail(to, { author, description, url }));
  }
}
