import { pageViewInputSchema, parisDate } from '@obsio/shared';
import { sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { findMembership, type Guards } from '../auth/guards.js';
import { withOrganisation, type Database } from '../db/client.js';
import { pageView } from '../db/schema/index.js';

// Pages vues : un compteur par organisation, jour et modèle de page. Hors requireOrganisation :
// un client en lecture seule consulte toujours ses données, ses pages vues comptent aussi.

export const usageRoutes: FastifyPluginAsyncZod<{ db: Database; guards: Guards }> = async (
  app,
  { db, guards },
) => {
  app.post(
    '/api/usage/page',
    {
      preHandler: guards.requireUser,
      schema: { body: pageViewInputSchema, response: { 204: z.null() } },
    },
    async (request, reply) => {
      const { id, activeOrganisationId } = request.user!;
      const membership = activeOrganisationId
        ? await findMembership(db, id, activeOrganisationId)
        : null;
      if (membership) {
        await withOrganisation(db, membership.id, (tx) =>
          tx
            .insert(pageView)
            .values({
              organisationId: membership.id,
              day: parisDate(),
              path: request.body.path,
              views: 1,
            })
            .onConflictDoUpdate({
              target: [pageView.organisationId, pageView.day, pageView.path],
              set: { views: sql`${pageView.views} + 1` },
            }),
        );
      }
      return reply.code(204).send(null);
    },
  );
};
