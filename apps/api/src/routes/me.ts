import { memberRoleSchema } from '@obsio/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { findMembership, type Guards } from '../auth/guards.js';
import type { Database } from '../db/client.js';

const meSchema = z.object({
  user: z.object({ id: z.uuid(), name: z.string(), email: z.email() }),
  organisation: z.object({ id: z.uuid(), name: z.string(), role: memberRoleSchema }).nullable(),
});

export const meRoutes: FastifyPluginAsyncZod<{
  db: Database;
  guards: Guards;
}> = async (app, { db, guards }) => {
  app.get(
    '/api/me',
    { preHandler: guards.requireUser, schema: { response: { 200: meSchema } } },
    async (request) => {
      const { id, name, email, activeOrganisationId } = request.user!;
      const organisation = activeOrganisationId
        ? await findMembership(db, id, activeOrganisationId)
        : null;
      return { user: { id, name, email }, organisation };
    },
  );
};
