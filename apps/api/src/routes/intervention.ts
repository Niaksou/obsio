import type { FileScanner } from '../antivirus.js';
import {
  interventionSchema,
  photoUploadRequestSchema,
  presignedPostSchema,
  PROOF_PHOTO_MAX_BYTES,
  proofInputSchema,
  proofPhotoPrefix,
} from '@obsio/shared';
import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import type { FastifyReply } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { ApiConfig } from '../config.js';
import { withOrganisation, type Database, type Transaction } from '../db/client.js';
import type { assignment } from '../db/schema/index.js';
import {
  assignmentReserve,
  building,
  contractor,
  equipment,
  floor,
  organisation,
  reserve,
  reserveSource,
  site,
} from '../db/schema/index.js';
import type { EmailSender } from '../email/sender.js';
import { notifyCorrection } from '../reserves/events.js';
import { addProof, checkPhotos, ProofError } from '../reserves/proofs.js';
import { currentAssignments, reserveProofs } from '../reserves/queries.js';
import type { Storage } from '../storage.js';
import { hashToken, PHOTO_EXTENSIONS } from './reserves.js';

// Vue de l'intervenant, sans compte : le jeton du lien donne accès aux seules réserves de son
// assignation, tant qu'elle n'est ni révoquée ni expirée.

const tokenParams = z.object({ token: z.string().min(20).max(100) });
const messageSchema = z.object({ message: z.string() });
const errors = { 400: messageSchema, 404: messageSchema, 410: messageSchema };

/** Limite par adresse IP, plus stricte que celle de l'API : les liens sont publics. */
const rateLimit = { max: 60, timeWindow: '1 minute' };

type Assignment = typeof assignment.$inferSelect;

export const interventionRoutes: FastifyPluginAsyncZod<{
  db: Database;
  storage: Storage;
  scanner: FileScanner;
  emailSender: EmailSender;
  config: ApiConfig;
}> = async (app, { db, storage, scanner, emailSender, config }) => {
  const fail = (reply: FastifyReply, code: 400 | 404 | 410, message: string) =>
    reply.code(code).send({ message });

  /**
   * Retrouve l'assignation par l'empreinte du jeton (politique RLS dédiée), puis exécute fn
   * dans le cloisonnement de son organisation.
   */
  async function withAssignment<T>(
    token: string,
    fn: (tx: Transaction, found: Assignment) => Promise<T>,
  ): Promise<T | 'missing' | 'expired'> {
    const found = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('app.assignment_token_hash', ${hashToken(token)}, true)`,
      );
      return tx.query.assignment.findFirst();
    });
    if (!found) return 'missing';
    if (found.revokedAt || found.expiresAt <= new Date()) return 'expired';
    return withOrganisation(db, found.organisationId, (tx) => fn(tx, found));
  }

  /** Réserves dont l'assignation en cours est celle du lien (une réassignation les retire). */
  async function assignedReserveIds(tx: Transaction, assignmentId: string) {
    const links = await tx
      .select({ reserveId: assignmentReserve.reserveId })
      .from(assignmentReserve)
      .innerJoin(reserve, eq(reserve.id, assignmentReserve.reserveId))
      .where(and(eq(assignmentReserve.assignmentId, assignmentId), ne(reserve.status, 'levee')));
    const current = await currentAssignments(
      tx,
      links.map((link) => link.reserveId),
    );
    return links
      .map((link) => link.reserveId)
      .filter((id) => current.get(id)?.assignmentId === assignmentId);
  }

  const refused = (reply: FastifyReply, result: 'missing' | 'expired') =>
    result === 'missing'
      ? fail(reply, 404, 'Lien introuvable.')
      : fail(reply, 410, 'Ce lien n’est plus valable : demandez-en un nouveau.');

  app.get(
    '/api/intervention/:token',
    {
      config: { rateLimit },
      schema: { params: tokenParams, response: { 200: interventionSchema, ...errors } },
    },
    async (request, reply) => {
      const result = await withAssignment(request.params.token, async (tx, found) => {
        const ids = await assignedReserveIds(tx, found.id);
        const rows = ids.length
          ? await tx
              .select({
                reserve,
                equipmentName: equipment.name,
                floorName: floor.name,
                buildingName: building.name,
                siteName: site.name,
              })
              .from(reserve)
              .innerJoin(site, eq(site.id, reserve.siteId))
              .leftJoin(equipment, eq(equipment.id, reserve.equipmentId))
              .leftJoin(floor, eq(floor.id, equipment.floorId))
              .leftJoin(building, eq(building.id, floor.buildingId))
              .where(inArray(reserve.id, ids))
              .orderBy(sql`${reserve.dueDate} asc nulls last`, reserve.createdAt)
          : [];
        const proofs = await reserveProofs(tx, storage, ids);
        const places = ids.length
          ? await tx
              .select({
                reserveId: reserveSource.reserveId,
                text: reserveSource.localisationTexte,
              })
              .from(reserveSource)
              .where(inArray(reserveSource.reserveId, ids))
              .orderBy(reserveSource.createdAt)
          : [];
        const org = await tx.query.organisation.findFirst({
          where: eq(organisation.id, found.organisationId),
        });
        const who = await tx.query.contractor.findFirst({
          where: eq(contractor.id, found.contractorId),
        });
        return {
          organisationName: org?.name ?? '',
          siteNames: [...new Set(rows.map((row) => row.siteName))],
          contractorName: who?.name ?? '',
          dueDate: found.dueDate,
          message: found.message,
          expiresAt: found.expiresAt.toISOString(),
          reserves: rows.map(({ reserve: r, equipmentName, floorName, buildingName }) => ({
            id: r.id,
            description: r.description,
            preconisation: r.preconisation,
            gravite: r.gravite,
            status: r.status,
            dueDate: r.dueDate,
            localisation: places.find((p) => p.reserveId === r.id && p.text)?.text ?? null,
            equipment: equipmentName
              ? {
                  name: equipmentName,
                  floorName: floorName ?? '',
                  buildingName: buildingName ?? '',
                }
              : null,
            proofs: proofs
              .filter((p) => p.reserveId === r.id)
              .map(({ reserveId: _r, photoKeys: _k, ...item }) => item),
          })),
        };
      });
      if (result === 'missing' || result === 'expired') return refused(reply, result);
      return result;
    },
  );

  app.post(
    '/api/intervention/:token/photos',
    {
      config: { rateLimit },
      schema: {
        params: tokenParams,
        body: photoUploadRequestSchema,
        response: { 200: presignedPostSchema, ...errors },
      },
    },
    async (request, reply) => {
      const { reserveId, contentType } = request.body;
      const result = await withAssignment(request.params.token, async (tx, found) =>
        (await assignedReserveIds(tx, found.id)).includes(reserveId) ? found : null,
      );
      if (result === 'missing' || result === 'expired') return refused(reply, result);
      if (!result) return fail(reply, 404, 'Réserve introuvable.');
      const key = `${proofPhotoPrefix(result.organisationId, reserveId)}${crypto.randomUUID()}.${PHOTO_EXTENSIONS[contentType]}`;
      return storage.presignedUpload(key, contentType, PROOF_PHOTO_MAX_BYTES);
    },
  );

  app.post(
    '/api/intervention/:token/reserves/:id/proofs',
    {
      config: { rateLimit },
      schema: {
        params: tokenParams.extend({ id: z.uuid() }),
        body: proofInputSchema,
        response: { 204: z.null(), ...errors },
      },
    },
    async (request, reply) => {
      const { token, id } = request.params;
      try {
        const result = await withAssignment(token, async (tx, found) => {
          if (!(await assignedReserveIds(tx, found.id)).includes(id)) return null;
          await checkPhotos({ storage, scanner }, found.organisationId, id, request.body.photoKeys);
          const added = await addProof(tx, found.organisationId, id, request.body, {
            contractorId: found.contractorId,
            assignmentId: found.id,
          });
          const row = await tx.query.reserve.findFirst({ where: eq(reserve.id, id) });
          const who = await tx.query.contractor.findFirst({
            where: eq(contractor.id, found.contractorId),
          });
          return { ...added, found, description: row!.description, author: who?.name ?? '' };
        });
        if (result === 'missing' || result === 'expired') return refused(reply, result);
        if (!result) return fail(reply, 404, 'Réserve introuvable.');
        if (result.corrected) {
          await notifyCorrection(
            { db, emailSender, config },
            result.found.organisationId,
            id,
            result.author,
            result.description,
          );
        }
        return reply.code(204).send(null);
      } catch (error) {
        if (error instanceof ProofError) return fail(reply, 400, error.message);
        throw error;
      }
    },
  );
};
