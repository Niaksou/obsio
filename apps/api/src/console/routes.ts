import { consoleAuditEntrySchema, consoleSessionSchema } from '@obsio/shared';
import { desc, eq } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Guards } from '../auth/guards.js';
import type { Database } from '../db/client.js';
import { consoleAudit, organisation, session, user } from '../db/schema/index.js';
import { isStaff } from './staff.js';

// Console Obsio : routes de l'équipe de l'éditeur. Toutes passent par requireStaff (compte de
// l'équipe, console déverrouillée par clé d'accès) sauf l'état de la session, qui ne dit rien
// à un compte client.

export const consoleRoutes: FastifyPluginAsyncZod<{ db: Database; guards: Guards }> = async (
  app,
  { db, guards },
) => {
  const { requireUser, requireStaff } = guards;

  app.get(
    '/api/console/session',
    { preHandler: requireUser, schema: { response: { 200: consoleSessionSchema } } },
    async (request) => {
      const staff = await isStaff(db, request.user!.id);
      if (!staff) return { staff: false, unlockedUntil: null };
      const [row] = await db
        .select({ consoleUntil: session.consoleUntil })
        .from(session)
        .where(eq(session.id, request.user!.sessionId));
      const until = row?.consoleUntil;
      return {
        staff: true,
        unlockedUntil: until && until > new Date() ? until.toISOString() : null,
      };
    },
  );

  app.get(
    '/api/console/audit',
    {
      preHandler: requireStaff,
      schema: { response: { 200: z.array(consoleAuditEntrySchema) } },
    },
    async () => {
      const rows = await db
        .select({
          entry: consoleAudit,
          actor: user.name,
          organisationName: organisation.name,
        })
        .from(consoleAudit)
        .innerJoin(user, eq(user.id, consoleAudit.actorId))
        .leftJoin(organisation, eq(organisation.id, consoleAudit.targetOrganisationId))
        .orderBy(desc(consoleAudit.createdAt))
        .limit(200);
      return rows.map(({ entry, actor, organisationName }) => ({
        id: entry.id,
        createdAt: entry.createdAt.toISOString(),
        actor,
        action: entry.action,
        organisationId: entry.targetOrganisationId,
        organisationName,
        details: entry.details,
      }));
    },
  );
};
