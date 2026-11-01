import { createHash, randomBytes } from 'node:crypto';
import {
  assignmentCreatedSchema,
  assignmentInputSchema,
  commentInputSchema,
  contractorInputSchema,
  contractorSchema,
  photoUploadRequestSchema,
  presignedPostSchema,
  PROOF_PHOTO_MAX_BYTES,
  proofInputSchema,
  proofPhotoPrefix,
  reserveDetailSchema,
  reserveFiltersSchema,
  reserveListItemSchema,
  reserveReviewSchema,
  reserveUpdateSchema,
} from '@obsio/shared';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Guards } from '../auth/guards.js';
import type { ApiConfig } from '../config.js';
import { withOrganisation, type Database, type Transaction } from '../db/client.js';
import {
  assignment,
  assignmentReserve,
  building,
  contractor,
  equipment,
  floor,
  organisation,
  reserve,
  site,
} from '../db/schema/index.js';
import type { EmailSender } from '../email/sender.js';
import { assignmentEmail } from '../email/templates.js';
import { notifyCorrection, recordEvent } from '../reserves/events.js';
import { addProof, checkPhotos, ProofError } from '../reserves/proofs.js';
import { currentAssignments, listReserves, reserveDetail } from '../reserves/queries.js';
import type { Storage } from '../storage.js';

// Suivi des réserves (J4, J5) : liste, détail, journal, modification, intervenants,
// assignations par lien signé, preuves et clôture. Lecture, commentaires et preuves pour tout
// membre ; modification, assignation et clôture pour l'admin.

const idParams = z.object({ id: z.uuid() });
const messageSchema = z.object({ message: z.string() });
const errors = { 400: messageSchema, 404: messageSchema, 409: messageSchema };

export const PHOTO_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** Jeton du lien intervenant : seule son empreinte est stockée. */
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export const reserveRoutes: FastifyPluginAsyncZod<{
  db: Database;
  guards: Guards;
  storage: Storage;
  emailSender: EmailSender;
  config: ApiConfig;
}> = async (app, { db, guards, storage, emailSender, config }) => {
  const { requireOrganisation: member, requireAdmin: admin } = guards;

  const scoped = <T>(request: FastifyRequest, fn: (tx: Transaction) => Promise<T>) =>
    withOrganisation(db, request.organisation!.id, fn);
  const fail = (reply: FastifyReply, code: 400 | 404 | 409, message: string) =>
    reply.code(code).send({ message });
  const activeSite = (tx: Transaction, id: string) =>
    tx.query.site.findFirst({ where: and(eq(site.id, id), isNull(site.archivedAt)) });

  // --- Lecture

  app.get(
    '/api/sites/:id/reserves',
    {
      preHandler: member,
      schema: {
        params: idParams,
        querystring: reserveFiltersSchema,
        response: { 200: z.array(reserveListItemSchema), ...errors },
      },
    },
    async (request, reply) => {
      const rows = await scoped(request, async (tx) => {
        if (!(await activeSite(tx, request.params.id))) return null;
        return listReserves(tx, request.params.id, request.query);
      });
      return rows ?? fail(reply, 404, 'Site introuvable');
    },
  );

  app.get(
    '/api/reserves/:id',
    {
      preHandler: member,
      schema: { params: idParams, response: { 200: reserveDetailSchema, ...errors } },
    },
    async (request, reply) => {
      const detail = await scoped(request, (tx) => reserveDetail(tx, storage, request.params.id));
      return detail ?? fail(reply, 404, 'Réserve introuvable');
    },
  );

  // --- Modification et journal

  app.patch(
    '/api/reserves/:id',
    {
      preHandler: admin,
      schema: {
        params: idParams,
        body: reserveUpdateSchema,
        response: { 204: z.null(), ...errors },
      },
    },
    async (request, reply) => {
      const result = await scoped(request, async (tx) => {
        const current = await tx.query.reserve.findFirst({
          where: eq(reserve.id, request.params.id),
        });
        if (!current) return 'missing' as const;
        if (current.status === 'levee') return 'Une réserve levée n’est plus modifiable.';
        const { equipmentId } = request.body;
        if (equipmentId) {
          const [found] = await tx
            .select({ id: equipment.id })
            .from(equipment)
            .innerJoin(floor, eq(floor.id, equipment.floorId))
            .innerJoin(building, eq(building.id, floor.buildingId))
            .where(and(eq(equipment.id, equipmentId), eq(building.siteId, current.siteId)));
          if (!found) return 'Équipement introuvable sur ce site.';
        }
        // Le journal garde l'avant et l'après de chaque champ modifié.
        const changes = Object.entries(request.body).filter(
          ([key, value]) => current[key as keyof typeof current] !== value,
        );
        if (changes.length === 0) return 'ok' as const;
        await tx.update(reserve).set(request.body).where(eq(reserve.id, current.id));
        await recordEvent(tx, {
          organisationId: current.organisationId,
          reserveId: current.id,
          type: 'modifiee',
          actorUserId: request.user!.id,
          data: Object.fromEntries(
            changes.map(([key, value]) => [
              key,
              { before: current[key as keyof typeof current] ?? null, after: value },
            ]),
          ),
        });
        return 'ok' as const;
      });
      if (result === 'missing') return fail(reply, 404, 'Réserve introuvable');
      if (result !== 'ok') return fail(reply, 400, result);
      return reply.code(204).send(null);
    },
  );

  app.post(
    '/api/reserves/:id/comments',
    {
      preHandler: member,
      schema: {
        params: idParams,
        body: commentInputSchema,
        response: { 204: z.null(), ...errors },
      },
    },
    async (request, reply) => {
      const found = await scoped(request, async (tx) => {
        const current = await tx.query.reserve.findFirst({
          where: eq(reserve.id, request.params.id),
        });
        if (!current) return false;
        await recordEvent(tx, {
          organisationId: current.organisationId,
          reserveId: current.id,
          type: 'commentaire',
          actorUserId: request.user!.id,
          data: { text: request.body.text },
        });
        return true;
      });
      return found ? reply.code(204).send(null) : fail(reply, 404, 'Réserve introuvable');
    },
  );

  // --- Preuves (membres) et clôture (admin)

  app.post(
    '/api/reserves/:id/photos',
    {
      preHandler: member,
      schema: {
        params: idParams,
        body: photoUploadRequestSchema.omit({ reserveId: true }),
        response: { 200: presignedPostSchema, ...errors },
      },
    },
    async (request, reply) => {
      const found = await scoped(request, (tx) =>
        tx.query.reserve.findFirst({ where: eq(reserve.id, request.params.id) }),
      );
      if (!found) return fail(reply, 404, 'Réserve introuvable');
      const { contentType } = request.body;
      const key = `${proofPhotoPrefix(request.organisation!.id, found.id)}${crypto.randomUUID()}.${PHOTO_EXTENSIONS[contentType]}`;
      return storage.presignedUpload(key, contentType, PROOF_PHOTO_MAX_BYTES);
    },
  );

  app.post(
    '/api/reserves/:id/proofs',
    {
      preHandler: member,
      schema: { params: idParams, body: proofInputSchema, response: { 204: z.null(), ...errors } },
    },
    async (request, reply) => {
      const organisationId = request.organisation!.id;
      try {
        await checkPhotos(storage, organisationId, request.params.id, request.body.photoKeys);
        const result = await scoped(request, (tx) =>
          addProof(tx, organisationId, request.params.id, request.body, {
            userId: request.user!.id,
          }),
        );
        if (result.corrected) {
          const row = await scoped(request, (tx) =>
            tx.query.reserve.findFirst({ where: eq(reserve.id, request.params.id) }),
          );
          await notifyCorrection(
            { db, emailSender, config },
            organisationId,
            request.params.id,
            request.user!.name,
            row!.description,
          );
        }
        return reply.code(204).send(null);
      } catch (error) {
        if (error instanceof ProofError) return fail(reply, 400, error.message);
        throw error;
      }
    },
  );

  app.post(
    '/api/reserves/:id/review',
    {
      preHandler: admin,
      schema: {
        params: idParams,
        body: reserveReviewSchema,
        response: { 204: z.null(), ...errors },
      },
    },
    async (request, reply) => {
      const result = await scoped(request, async (tx) => {
        const current = await tx.query.reserve.findFirst({
          where: eq(reserve.id, request.params.id),
        });
        if (!current) return 'missing' as const;
        if (current.status !== 'corrigee') {
          return 'Seule une réserve corrigée peut être levée ou renvoyée en correction.';
        }
        const { decision, comment } = request.body;
        if (decision === 'lever') {
          await tx
            .update(reserve)
            .set({ status: 'levee', closedAt: new Date() })
            .where(eq(reserve.id, current.id));
        } else {
          const assigned = (await currentAssignments(tx, [current.id])).has(current.id);
          await tx
            .update(reserve)
            .set({ status: assigned ? 'assignee' : 'ouverte' })
            .where(eq(reserve.id, current.id));
        }
        await recordEvent(tx, {
          organisationId: current.organisationId,
          reserveId: current.id,
          type: decision === 'lever' ? 'levee' : 'correction_refusee',
          actorUserId: request.user!.id,
          data: { comment },
        });
        return 'ok' as const;
      });
      if (result === 'missing') return fail(reply, 404, 'Réserve introuvable');
      if (result !== 'ok') return fail(reply, 409, result);
      return reply.code(204).send(null);
    },
  );

  // --- Intervenants

  app.get(
    '/api/contractors',
    { preHandler: member, schema: { response: { 200: z.array(contractorSchema) } } },
    async (request) => {
      const rows = await scoped(request, (tx) =>
        tx
          .select()
          .from(contractor)
          .where(isNull(contractor.archivedAt))
          .orderBy(asc(contractor.name)),
      );
      return rows.map(({ id, name, company, email }) => ({ id, name, company, email }));
    },
  );

  app.post(
    '/api/contractors',
    {
      preHandler: admin,
      schema: { body: contractorInputSchema, response: { 201: contractorSchema } },
    },
    async (request, reply) => {
      const [row] = await scoped(request, (tx) =>
        tx
          .insert(contractor)
          .values({ organisationId: request.organisation!.id, ...request.body })
          .returning(),
      );
      const { id, name, company, email } = row!;
      return reply.code(201).send({ id, name, company, email });
    },
  );

  app.patch(
    '/api/contractors/:id',
    {
      preHandler: admin,
      schema: {
        params: idParams,
        body: contractorInputSchema.partial(),
        response: { 200: contractorSchema, ...errors },
      },
    },
    async (request, reply) => {
      const [row] = await scoped(request, (tx) =>
        tx
          .update(contractor)
          .set(request.body)
          .where(and(eq(contractor.id, request.params.id), isNull(contractor.archivedAt)))
          .returning(),
      );
      if (!row) return fail(reply, 404, 'Intervenant introuvable');
      return { id: row.id, name: row.name, company: row.company, email: row.email };
    },
  );

  // --- Assignations

  app.post(
    '/api/assignments',
    {
      preHandler: admin,
      schema: {
        body: assignmentInputSchema,
        response: { 201: assignmentCreatedSchema, ...errors },
      },
    },
    async (request, reply) => {
      const organisationId = request.organisation!.id;
      const { contractorId, reserveIds, dueDate, message, validityDays } = request.body;
      const token = randomBytes(32).toString('base64url');
      const expiresAt = new Date(Date.now() + validityDays * 24 * 3600 * 1000);

      const result = await scoped(request, async (tx) => {
        const target = await tx.query.contractor.findFirst({
          where: and(eq(contractor.id, contractorId), isNull(contractor.archivedAt)),
        });
        if (!target) return 'Intervenant introuvable.';
        const reserves = await tx.select().from(reserve).where(inArray(reserve.id, reserveIds));
        if (reserves.length !== new Set(reserveIds).size) return 'Réserve introuvable.';
        if (reserves.some((r) => r.status === 'levee' || r.status === 'corrigee')) {
          return 'Une réserve corrigée ou levée ne peut pas être assignée.';
        }
        const [created] = await tx
          .insert(assignment)
          .values({
            organisationId,
            contractorId,
            dueDate,
            message,
            tokenHash: hashToken(token),
            expiresAt,
            createdBy: request.user!.id,
          })
          .returning();
        await tx
          .insert(assignmentReserve)
          .values(
            reserves.map((r) => ({ organisationId, assignmentId: created!.id, reserveId: r.id })),
          );
        for (const r of reserves) {
          // L'échéance de l'assignation devient celle de la réserve.
          await tx
            .update(reserve)
            .set({ status: 'assignee', ...(dueDate ? { dueDate } : {}) })
            .where(eq(reserve.id, r.id));
          await recordEvent(tx, {
            organisationId,
            reserveId: r.id,
            type: 'assignee',
            actorUserId: request.user!.id,
            data: {
              assignmentId: created!.id,
              contractor: target.name,
              dueDate,
              before: { status: r.status, dueDate: r.dueDate },
            },
          });
        }
        const org = await tx.query.organisation.findFirst({
          where: eq(organisation.id, organisationId),
        });
        return { created: created!, target, organisationName: org?.name ?? '' };
      });
      if (typeof result === 'string') return fail(reply, 400, result);

      const link = `${config.WEB_URL}/intervention/${token}`;
      await emailSender.send(
        assignmentEmail(result.target.email, {
          organisationName: result.organisationName,
          reserveCount: reserveIds.length,
          dueDate,
          message,
          url: link,
        }),
      );
      const { created, target } = result;
      return reply.code(201).send({
        id: created.id,
        contractor: { id: target.id, name: target.name, company: target.company },
        dueDate: created.dueDate,
        expiresAt: created.expiresAt.toISOString(),
        revokedAt: null,
        createdAt: created.createdAt.toISOString(),
        link,
      });
    },
  );

  app.post(
    '/api/assignments/:id/revoke',
    {
      preHandler: admin,
      schema: { params: idParams, response: { 204: z.null(), ...errors } },
    },
    async (request, reply) => {
      const found = await scoped(request, async (tx) => {
        const [row] = await tx
          .update(assignment)
          .set({ revokedAt: new Date() })
          .where(and(eq(assignment.id, request.params.id), isNull(assignment.revokedAt)))
          .returning();
        if (!row) return false;
        const links = await tx
          .select({ reserveId: assignmentReserve.reserveId })
          .from(assignmentReserve)
          .where(eq(assignmentReserve.assignmentId, row.id));
        const stillAssigned = await currentAssignments(
          tx,
          links.map((link) => link.reserveId),
        );
        for (const { reserveId } of links) {
          await recordEvent(tx, {
            organisationId: row.organisationId,
            reserveId,
            type: 'assignation_revoquee',
            actorUserId: request.user!.id,
            data: { assignmentId: row.id },
          });
          // Sans autre assignation en cours, la réserve redevient simplement ouverte.
          if (!stillAssigned.has(reserveId)) {
            await tx
              .update(reserve)
              .set({ status: 'ouverte' })
              .where(and(eq(reserve.id, reserveId), eq(reserve.status, 'assignee')));
          }
        }
        return true;
      });
      return found ? reply.code(204).send(null) : fail(reply, 404, 'Assignation introuvable');
    },
  );
};
