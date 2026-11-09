import { eq } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { session, twoFactor, user } from '../db/schema/index.js';

/**
 * Réinitialise la double authentification d'un utilisateur qui a perdu son téléphone et ses
 * codes de secours : secret supprimé, sessions fermées. À sa prochaine connexion (mot de passe),
 * il configure une nouvelle application. L'éditeur vérifie d'abord l'identité du demandeur
 * auprès de l'admin de son organisation, par un autre canal que l'e-mail.
 */
export async function resetTwoFactor(db: Database, email: string) {
  return db.transaction(async (tx) => {
    const [found] = await tx
      .update(user)
      .set({ twoFactorEnabled: false })
      .where(eq(user.email, email.toLowerCase()))
      .returning({ id: user.id, name: user.name });
    if (!found) return null;
    await tx.delete(twoFactor).where(eq(twoFactor.userId, found.id));
    await tx.delete(session).where(eq(session.userId, found.id));
    return found;
  });
}
