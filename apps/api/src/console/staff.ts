import { eq } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { consoleAudit, staffMember, user } from '../db/schema/index.js';

// Équipe Obsio : qui peut ouvrir la console, et le journal de ce qu'elle y fait.

/** Durée sans activité après laquelle la console se reverrouille (clé d'accès redemandée). */
export const CONSOLE_IDLE_MS = 15 * 60 * 1000;

export async function isStaff(db: Database, userId: string) {
  const [row] = await db
    .select({ userId: staffMember.userId })
    .from(staffMember)
    .where(eq(staffMember.userId, userId));
  return !!row;
}

/** Trace une action de la console. `details` ne contient jamais de contenu d'un client. */
export async function audit(
  db: Database,
  entry: {
    actorId: string;
    action: string;
    organisationId?: string | null;
    details?: Record<string, unknown>;
  },
) {
  await db.insert(consoleAudit).values({
    actorId: entry.actorId,
    action: entry.action,
    targetOrganisationId: entry.organisationId ?? null,
    details: entry.details ?? {},
  });
}

/** Attribue ou retire le statut d'équipe Obsio (base ouverte avec le rôle propriétaire). */
export async function setStaff(ownerDb: Database, email: string, granted: boolean) {
  const [found] = await ownerDb
    .select({ id: user.id, twoFactorEnabled: user.twoFactorEnabled })
    .from(user)
    .where(eq(user.email, email.trim().toLowerCase()));
  if (!found) throw new Error(`Aucun compte pour ${email} : il doit d'abord exister dans Obsio.`);
  if (granted) {
    await ownerDb.insert(staffMember).values({ userId: found.id }).onConflictDoNothing();
  } else {
    await ownerDb.delete(staffMember).where(eq(staffMember.userId, found.id));
  }
  return found;
}
