import { invitationDetailsSchema, memberRoleSchema } from '@obsio/shared';
import { and, eq, gt } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Guards } from '../auth/guards.js';
import type { Database } from '../db/client.js';
import { invitation, organisation, user } from '../db/schema/index.js';

/**
 * Détail d'une invitation pour l'invité connecté. Better Auth exige que l'expéditeur soit
 * membre de l'organisation, ce que n'est pas l'opérateur qui ouvre un nouveau client.
 */
export const invitationRoutes: FastifyPluginAsyncZod<{
  db: Database;
  guards: Guards;
}> = async (app, { db, guards }) => {
  app.get(
    '/api/invitations/:id',
    {
      preHandler: guards.requireUser,
      schema: {
        params: z.object({ id: z.uuid() }),
        response: { 200: invitationDetailsSchema, 404: z.object({ message: z.string() }) },
      },
    },
    async (request, reply) => {
      const [row] = await db
        .select({
          id: invitation.id,
          organisationName: organisation.name,
          inviterName: user.name,
          role: invitation.role,
        })
        .from(invitation)
        .innerJoin(organisation, eq(organisation.id, invitation.organisationId))
        .innerJoin(user, eq(user.id, invitation.inviterId))
        .where(
          and(
            eq(invitation.id, request.params.id),
            eq(invitation.email, request.user!.email.toLowerCase()),
            eq(invitation.status, 'pending'),
            gt(invitation.expiresAt, new Date()),
          ),
        );
      if (!row) {
        return reply.code(404).send({
          message:
            'Invitation introuvable, expirée ou destinée à une autre adresse. Demandez-en une nouvelle.',
        });
      }
      return { ...row, role: memberRoleSchema.parse(row.role) };
    },
  );
};
