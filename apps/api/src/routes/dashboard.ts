import { proofDossierQuerySchema, siteDashboardSchema } from '@obsio/shared';
import { and, eq, isNull } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Guards } from '../auth/guards.js';
import { withOrganisation, type Database } from '../db/client.js';
import { organisation, site } from '../db/schema/index.js';
import { siteDashboard } from '../reserves/dashboard.js';
import { buildProofDossier } from '../reserves/dossier.js';
import type { Storage } from '../storage.js';

// Pilotage (J6) : tableau de bord d'un site et dossier de preuves en PDF, pour tout membre.

const idParams = z.object({ id: z.uuid() });
const messageSchema = z.object({ message: z.string() });

export const dashboardRoutes: FastifyPluginAsyncZod<{
  db: Database;
  guards: Guards;
  storage: Storage;
}> = async (app, { db, guards, storage }) => {
  const member = guards.requireOrganisation;

  app.get(
    '/api/sites/:id/dashboard',
    {
      preHandler: member,
      schema: { params: idParams, response: { 200: siteDashboardSchema, 404: messageSchema } },
    },
    async (request, reply) => {
      const result = await withOrganisation(db, request.organisation!.id, async (tx) => {
        const found = await tx.query.site.findFirst({
          where: and(eq(site.id, request.params.id), isNull(site.archivedAt)),
        });
        return found ? siteDashboard(tx, found.id) : null;
      });
      return result ?? reply.code(404).send({ message: 'Site introuvable' });
    },
  );

  app.get(
    '/api/sites/:id/proof-dossier',
    {
      preHandler: member,
      schema: { params: idParams, querystring: proofDossierQuerySchema },
    },
    async (request, reply) => {
      const organisationId = request.organisation!.id;
      const pdf = await withOrganisation(db, organisationId, async (tx) => {
        const found = await tx.query.site.findFirst({
          where: and(eq(site.id, request.params.id), isNull(site.archivedAt)),
        });
        if (!found) return null;
        const org = await tx.query.organisation.findFirst({
          where: eq(organisation.id, organisationId),
        });
        return buildProofDossier(tx, storage, {
          organisationName: org?.name ?? '',
          site: { id: found.id, name: found.name, address: found.address },
          documentType: request.query.documentType,
          scope: request.query.scope,
        });
      });
      if (!pdf) return reply.code(404).send({ message: 'Site introuvable' });
      const day = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
      return reply
        .type('application/pdf')
        .header('Content-Disposition', `attachment; filename="dossier-preuves-${day}.pdf"`)
        .send(pdf);
    },
  );
};
