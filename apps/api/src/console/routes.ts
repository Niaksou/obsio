import {
  consoleAuditEntrySchema,
  consoleClientCreateSchema,
  consoleClientDetailSchema,
  consoleClientSchema,
  consoleSessionSchema,
  consoleUsageSchema,
  licenceSchema,
} from '@obsio/shared';
import { desc, eq } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Guards } from '../auth/guards.js';
import type { ApiConfig } from '../config.js';
import { withOrganisation, type Database } from '../db/client.js';
import { consoleAudit, organisation, session, user } from '../db/schema/index.js';
import type { EmailSender } from '../email/sender.js';
import { readLicence, saveLicence } from '../licences/licence.js';
import { provisionOrganisation } from '../organisations/provision.js';
import { licenceAction, licenceChanges, listClients, onboarding } from './clients.js';
import { audit, isStaff } from './staff.js';
import { clientActivity, consoleUsage } from './usage.js';

const messageSchema = z.object({ message: z.string() });

// Console Obsio : routes de l'équipe de l'éditeur. Toutes passent par requireStaff (compte de
// l'équipe, console déverrouillée par clé d'accès) sauf l'état de la session, qui ne dit rien
// à un compte client.

export const consoleRoutes: FastifyPluginAsyncZod<{
  db: Database;
  guards: Guards;
  config: ApiConfig;
  emailSender: EmailSender;
}> = async (app, { db, guards, config, emailSender }) => {
  const { requireUser, requireStaff } = guards;

  /** Journal de la console, le plus récent d'abord ; d'un seul client si demandé. */
  async function auditEntries(organisationId?: string) {
    const rows = await db
      .select({ entry: consoleAudit, actor: user.name, organisationName: organisation.name })
      .from(consoleAudit)
      .innerJoin(user, eq(user.id, consoleAudit.actorId))
      .leftJoin(organisation, eq(organisation.id, consoleAudit.targetOrganisationId))
      .where(organisationId ? eq(consoleAudit.targetOrganisationId, organisationId) : undefined)
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
  }

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
    async () => auditEntries(),
  );

  app.get(
    '/api/console/clients',
    { preHandler: requireStaff, schema: { response: { 200: z.array(consoleClientSchema) } } },
    async () => listClients(db),
  );

  app.post(
    '/api/console/clients',
    {
      preHandler: requireStaff,
      schema: {
        body: consoleClientCreateSchema,
        response: { 201: z.object({ id: z.uuid() }), 409: messageSchema },
      },
    },
    async (request, reply) => {
      const { name, adminEmail, licence } = request.body;
      const created = await provisionOrganisation(
        { config, db, emailSender },
        { name, adminEmail, licence },
      );
      await audit(db, {
        actorId: request.user!.id,
        action: 'client.cree',
        organisationId: created.organisation.id,
        details: { nom: name, licence },
      });
      return reply.code(201).send({ id: created.organisation.id });
    },
  );

  app.put(
    '/api/console/clients/:id/licence',
    {
      preHandler: requireStaff,
      schema: {
        params: z.object({ id: z.uuid() }),
        body: licenceSchema,
        response: { 204: z.null(), 404: messageSchema },
      },
    },
    async (request, reply) => {
      const organisationId = request.params.id;
      const found = await db.query.organisation.findFirst({
        where: eq(organisation.id, organisationId),
      });
      if (!found) return reply.code(404).send({ message: 'Client introuvable' });
      const before = await withOrganisation(db, organisationId, async (tx) => {
        const current = await readLicence(tx);
        await saveLicence(tx, organisationId, request.body);
        return current;
      });
      const changes = licenceChanges(before, request.body);
      if (Object.keys(changes).length > 0) {
        await audit(db, {
          actorId: request.user!.id,
          action: licenceAction(before, request.body),
          organisationId,
          details: changes,
        });
      }
      return reply.code(204).send(null);
    },
  );

  app.get(
    '/api/console/usage',
    {
      preHandler: requireStaff,
      schema: {
        querystring: z.object({ days: z.coerce.number().int().min(7).max(366).default(30) }),
        response: { 200: consoleUsageSchema },
      },
    },
    async (request) => consoleUsage(db, config, request.query.days),
  );

  app.get(
    '/api/console/clients/:id',
    {
      preHandler: requireStaff,
      schema: {
        params: z.object({ id: z.uuid() }),
        response: { 200: consoleClientDetailSchema, 404: messageSchema },
      },
    },
    async (request, reply) => {
      const [client] = await listClients(db, request.params.id);
      if (!client) return reply.code(404).send({ message: 'Client introuvable' });
      return {
        client,
        onboarding: await onboarding(db, client.id, client.members),
        activity: await clientActivity(db, client.id, 90),
        audit: await auditEntries(client.id),
      };
    },
  );
};
