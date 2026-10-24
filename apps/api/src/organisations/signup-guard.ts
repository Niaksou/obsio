import { and, eq, gt, sql } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { invitation } from '../db/schema/index.js';

/** Vrai si une invitation en attente et non expirée existe pour cette adresse. */
export async function hasPendingInvitation(db: Database, email: string): Promise<boolean> {
  const [row] = await db
    .select({ id: invitation.id })
    .from(invitation)
    .where(
      and(
        eq(sql`lower(${invitation.email})`, email.trim().toLowerCase()),
        eq(invitation.status, 'pending'),
        gt(invitation.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return row !== undefined;
}
