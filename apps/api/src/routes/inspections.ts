import { inspectionKindSchema, inspectionSchema, updateInspectionSchema } from '@obsio/shared';
import { and, eq, isNull } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Guards } from '../auth/guards.js';
import { withOrganisation, type Database } from '../db/client.js';
import { inspectionPlan, site } from '../db/schema/index.js';
import { listInspections } from '../inspections/schedule.js';

// Échéancier des vérifications : consultation par tout membre, réglages par l'admin.

const idParams = z.object({ id: z.uuid() });
const messageSchema = z.object({ message: z.string() });
const notFound = { 404: messageSchema };

export const inspectionRoutes: FastifyPluginAsyncZod<{ db: Database; guards: Guards }> = async (
  app,
  { db, guards },
) => {
  const { requireOrganisation: member, requireAdmin: admin } = guards;

  app.get(
    '/api/inspections',
    { preHandler: member, schema: { response: { 200: z.array(inspectionSchema) } } },
    async (request) => withOrganisation(db, request.organisation!.id, (tx) => listInspections(tx)),
  );

  app.get(
    '/api/sites/:id/inspections',
    {
      preHandler: member,
      schema: { params: idParams, response: { 200: z.array(inspectionSchema), ...notFound } },
    },
    async (request, reply) => {
      const rows = await withOrganisation(db, request.organisation!.id, (tx) =>
        listInspections(tx, { siteId: request.params.id }),
      );
      return rows.length > 0 ? rows : reply.code(404).send({ message: 'Site introuvable' });
    },
  );

  app.put(
    '/api/sites/:id/inspections/:kind',
    {
      preHandler: admin,
      schema: {
        params: idParams.extend({ kind: inspectionKindSchema }),
        body: updateInspectionSchema,
        response: { 200: inspectionSchema, ...notFound },
      },
    },
    async (request, reply) => {
      const organisationId = request.organisation!.id;
      const { id: siteId, kind } = request.params;
      const { contact, ...settings } = request.body;
      const updated = await withOrganisation(db, organisationId, async (tx) => {
        const found = await tx.query.site.findFirst({
          where: and(eq(site.id, siteId), isNull(site.archivedAt)),
        });
        if (!found) return null;
        const values = { ...settings, contact: contact || null };
        await tx
          .insert(inspectionPlan)
          .values({ organisationId, siteId, kind, ...values })
          .onConflictDoUpdate({
            target: [inspectionPlan.siteId, inspectionPlan.kind],
            set: values,
          });
        const rows = await listInspections(tx, { siteId });
        return rows.find((row) => row.kind === kind)!;
      });
      return updated ?? reply.code(404).send({ message: 'Site introuvable' });
    },
  );
};
