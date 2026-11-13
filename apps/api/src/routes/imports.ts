import type { FileScanner } from '../antivirus.js';
import {
  draftUpdateSchema,
  presignedPostSchema,
  REPORT_MAX_BYTES,
  reportImportCreateSchema,
  reportImportDetailSchema,
  reportImportKeys,
  reportImportSchema,
  reportUploadRequestSchema,
} from '@obsio/shared';
import { and, asc, count, desc, eq, isNull } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Guards } from '../auth/guards.js';
import { withOrganisation, type Database, type Transaction } from '../db/client.js';
import {
  building,
  draftReserve,
  equipment,
  floor,
  reportDocument,
  reportImport,
  reserve,
  site,
} from '../db/schema/index.js';
import { activateImport, ActivationError } from '../imports/activate.js';
import { ingestImport, openSiteReserves } from '../imports/ingest.js';
import type { ExtractionQueue } from '../imports/queue.js';
import { assertAnalysisAvailable } from '../licences/licence.js';
import { QUOTAS, type Quotas } from '../quotas.js';
import type { Storage } from '../storage.js';
import { verifiedContentType } from '../file-signature.js';

// Import des rapports (J3) : dépôt du PDF, suivi de l'analyse, relecture des brouillons,
// validation. Consultation pour tout membre ; dépôt, relecture et validation pour l'admin.

const idParams = z.object({ id: z.uuid() });
const messageSchema = z.object({ message: z.string() });
const errors = { 400: messageSchema, 404: messageSchema, 409: messageSchema };

type ImportRow = typeof reportImport.$inferSelect;

export const importRoutes: FastifyPluginAsyncZod<{
  db: Database;
  guards: Guards;
  storage: Storage;
  scanner: FileScanner;
  queue: ExtractionQueue;
  quotas: Quotas;
}> = async (app, { db, guards, storage, scanner, queue, quotas }) => {
  const { requireOrganisation: member, requireManager: manager } = guards;

  const scoped = <T>(request: FastifyRequest, fn: (tx: Transaction) => Promise<T>) =>
    withOrganisation(db, request.organisation!.id, fn);
  const fail = (reply: FastifyReply, code: 400 | 404 | 409, message: string) =>
    reply.code(code).send({ message });

  const activeSite = (tx: Transaction, id: string) =>
    tx.query.site.findFirst({ where: and(eq(site.id, id), isNull(site.archivedAt)) });

  /** Nombre de brouillons, ou de réserves créées une fois l'import validé. */
  async function reserveCount(tx: Transaction, row: ImportRow) {
    const [result] =
      row.status === 'valide'
        ? await tx.select({ n: count() }).from(reserve).where(eq(reserve.importId, row.id))
        : await tx
            .select({ n: count() })
            .from(draftReserve)
            .where(eq(draftReserve.importId, row.id));
    return result?.n ?? 0;
  }

  const toImport = async (tx: Transaction, row: ImportRow) => ({
    id: row.id,
    siteId: row.siteId,
    fileName: row.fileName,
    status: row.status,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
    validatedAt: row.validatedAt?.toISOString() ?? null,
    reserveCount: await reserveCount(tx, row),
  });

  // --- Dépôt

  app.post(
    '/api/sites/:id/imports/upload',
    {
      preHandler: manager,
      schema: {
        params: idParams,
        body: reportUploadRequestSchema,
        response: { 200: presignedPostSchema, ...errors },
      },
    },
    async (request, reply) => {
      const row = await scoped(request, (tx) => activeSite(tx, request.params.id));
      if (!row) return fail(reply, 404, 'Site introuvable');
      // Prévenu avant le dépôt plutôt qu'après : le quota n'est consommé qu'à l'analyse.
      await scoped(request, assertAnalysisAvailable);
      await quotas.check(QUOTAS.analyses, request.organisation!.id);
      // L'identifiant de l'import est choisi ici : il fait partie de la clé du PDF.
      const keys = reportImportKeys(request.organisation!.id, crypto.randomUUID());
      return storage.presignedUpload(keys.pdf, 'application/pdf', REPORT_MAX_BYTES);
    },
  );

  app.post(
    '/api/sites/:id/imports',
    {
      preHandler: manager,
      schema: {
        params: idParams,
        body: reportImportCreateSchema,
        response: { 201: reportImportSchema, ...errors },
      },
    },
    async (request, reply) => {
      const organisationId = request.organisation!.id;
      const match = request.body.key.match(
        /^organisations\/([0-9a-f-]{36})\/imports\/([0-9a-f-]{36})\/rapport\.pdf$/,
      );
      if (!match || match[1] !== organisationId) {
        return fail(reply, 400, "Fichier étranger à l'organisation");
      }
      const importId = match[2]!;
      if (
        (await verifiedContentType({ storage, scanner }, request.body.key)) !== 'application/pdf'
      ) {
        return fail(reply, 400, 'PDF du rapport introuvable : relancez le dépôt.');
      }
      // Consommé avant l'enregistrement : un import enregistré part toujours à l'analyse.
      await scoped(request, assertAnalysisAvailable);
      await quotas.consume(QUOTAS.analyses, organisationId);
      const created = await scoped(request, async (tx) => {
        if (!(await activeSite(tx, request.params.id))) return null;
        const existing = await tx.query.reportImport.findFirst({
          where: eq(reportImport.id, importId),
        });
        if (existing) return 'exists' as const;
        const [row] = await tx
          .insert(reportImport)
          .values({
            id: importId,
            organisationId,
            siteId: request.params.id,
            fileName: request.body.fileName,
            pdfKey: request.body.key,
            createdBy: request.user!.id,
          })
          .returning();
        return toImport(tx, row!);
      });
      if (!created) return fail(reply, 404, 'Site introuvable');
      if (created === 'exists') return fail(reply, 409, 'Ce rapport est déjà importé.');
      await queue.enqueue({ organisationId, importId });
      return reply.code(201).send(created);
    },
  );

  // --- Suivi

  app.get(
    '/api/sites/:id/imports',
    {
      preHandler: member,
      schema: { params: idParams, response: { 200: z.array(reportImportSchema), ...errors } },
    },
    async (request, reply) => {
      const organisationId = request.organisation!.id;
      const pending = await scoped(request, (tx) =>
        tx
          .select({ id: reportImport.id })
          .from(reportImport)
          .where(
            and(eq(reportImport.siteId, request.params.id), eq(reportImport.status, 'en_analyse')),
          ),
      );
      for (const { id } of pending) await ingestImport({ db, storage, queue }, organisationId, id);
      const rows = await scoped(request, async (tx) => {
        if (!(await activeSite(tx, request.params.id))) return null;
        const imports = await tx
          .select()
          .from(reportImport)
          .where(eq(reportImport.siteId, request.params.id))
          .orderBy(desc(reportImport.createdAt));
        return Promise.all(imports.map((row) => toImport(tx, row)));
      });
      return rows ?? fail(reply, 404, 'Site introuvable');
    },
  );

  app.get(
    '/api/imports/:id',
    {
      preHandler: member,
      schema: { params: idParams, response: { 200: reportImportDetailSchema, ...errors } },
    },
    async (request, reply) => {
      await ingestImport({ db, storage, queue }, request.organisation!.id, request.params.id);
      const detail = await scoped(request, async (tx) => {
        const row = await tx.query.reportImport.findFirst({
          where: eq(reportImport.id, request.params.id),
        });
        if (!row) return null;
        const documents = await tx
          .select()
          .from(reportDocument)
          .where(eq(reportDocument.importId, row.id))
          .orderBy(asc(reportDocument.position));
        const drafts = await tx
          .select()
          .from(draftReserve)
          .where(eq(draftReserve.importId, row.id))
          .orderBy(asc(draftReserve.position));
        const open = row.status === 'a_valider' ? await openSiteReserves(tx, row.siteId) : [];
        return {
          ...(await toImport(tx, row)),
          pdfUrl: await storage.signedDownloadUrl(row.pdfKey),
          documents: documents.map((doc) => ({
            id: doc.id,
            type: doc.type,
            organisme: doc.organisme,
            numeroRapport: doc.numeroRapport,
            dateVisite: doc.dateVisite,
            q18: doc.q18,
            q19: doc.q19,
          })),
          drafts: drafts.map((draft) => ({
            id: draft.id,
            documentId: draft.documentId,
            origin: draft.origin,
            extracted: draft.extracted,
            confiance: draft.confiance,
            description: draft.description,
            preconisation: draft.preconisation,
            gravite: draft.gravite,
            equipmentId: draft.equipmentId,
            proposedEquipmentId: draft.proposedEquipmentId,
            reconduiteDeId: draft.reconduiteDeId,
            proposedReconduiteDeId: draft.proposedReconduiteDeId,
            mergeIntoId: draft.mergeIntoId,
            proposedMergeIntoId: draft.proposedMergeIntoId,
            decision: draft.decision,
          })),
          openReserves: open.map((r) => ({
            id: r.id,
            description: r.description,
            equipmentId: r.equipmentId,
            reference: r.reference,
          })),
        };
      });
      return detail ?? fail(reply, 404, 'Import introuvable');
    },
  );

  app.post(
    '/api/imports/:id/retry',
    {
      preHandler: manager,
      schema: { params: idParams, response: { 200: reportImportSchema, ...errors } },
    },
    async (request, reply) => {
      const organisationId = request.organisation!.id;
      const row = await scoped(request, (tx) =>
        tx.query.reportImport.findFirst({ where: eq(reportImport.id, request.params.id) }),
      );
      if (!row) return fail(reply, 404, 'Import introuvable');
      if (row.status !== 'erreur') return fail(reply, 409, 'Seul un import en erreur se relance.');
      await quotas.consume(QUOTAS.analyses, organisationId);
      // Le résultat en erreur serait relu tout de suite : on le retire avant de relancer.
      await storage.remove(reportImportKeys(organisationId, row.id).extraction);
      const updated = await scoped(request, async (tx) => {
        const [next] = await tx
          .update(reportImport)
          .set({ status: 'en_analyse', error: null })
          .where(eq(reportImport.id, row.id))
          .returning();
        return toImport(tx, next!);
      });
      await queue.enqueue({ organisationId, importId: row.id });
      return updated;
    },
  );

  // --- Relecture et validation

  app.patch(
    '/api/drafts/:id',
    {
      preHandler: manager,
      schema: { params: idParams, body: draftUpdateSchema, response: { 204: z.null(), ...errors } },
    },
    async (request, reply) => {
      const result = await scoped(request, async (tx) => {
        const draft = await tx.query.draftReserve.findFirst({
          where: eq(draftReserve.id, request.params.id),
        });
        if (!draft) return 'missing' as const;
        const importRow = await tx.query.reportImport.findFirst({
          where: eq(reportImport.id, draft.importId),
        });
        if (importRow?.status !== 'a_valider') return 'Cet import n’est plus modifiable.';
        const body = request.body;

        if (body.equipmentId) {
          const [found] = await tx
            .select({ id: equipment.id })
            .from(equipment)
            .innerJoin(floor, eq(floor.id, equipment.floorId))
            .innerJoin(building, eq(building.id, floor.buildingId))
            .where(
              and(
                eq(equipment.id, body.equipmentId),
                eq(building.siteId, importRow.siteId),
                isNull(equipment.archivedAt),
              ),
            );
          if (!found) return 'Équipement introuvable sur ce site.';
        }
        if (body.reconduiteDeId) {
          const open = await openSiteReserves(tx, importRow.siteId);
          if (!open.some((r) => r.id === body.reconduiteDeId)) {
            return 'Réserve d’origine introuvable parmi les réserves en cours du site.';
          }
        }
        if (body.mergeIntoId) {
          const into = await tx.query.draftReserve.findFirst({
            where: eq(draftReserve.id, body.mergeIntoId),
          });
          if (
            !into ||
            into.importId !== draft.importId ||
            into.id === draft.id ||
            into.documentId === draft.documentId ||
            into.mergeIntoId
          ) {
            return 'Regroupement impossible : choisissez une réserve d’un autre document de cet import.';
          }
          const [mergedInto] = await tx
            .select({ n: count() })
            .from(draftReserve)
            .where(eq(draftReserve.mergeIntoId, draft.id));
          if ((mergedInto?.n ?? 0) > 0) {
            return 'D’autres réserves sont regroupées avec celle-ci : regroupez-les plutôt ici.';
          }
        }
        await tx.update(draftReserve).set(body).where(eq(draftReserve.id, draft.id));
        return 'ok' as const;
      });
      if (result === 'missing') return fail(reply, 404, 'Réserve introuvable');
      if (result !== 'ok') return fail(reply, 400, result);
      return reply.code(204).send(null);
    },
  );

  app.post(
    '/api/imports/:id/validate',
    {
      preHandler: manager,
      schema: { params: idParams, response: { 200: reportImportSchema, ...errors } },
    },
    async (request, reply) => {
      try {
        const result = await scoped(request, async (tx) => {
          const [row] = await tx
            .select()
            .from(reportImport)
            .where(eq(reportImport.id, request.params.id))
            .for('update');
          if (!row) return null;
          if (row.status !== 'a_valider') {
            throw new ActivationError('Cet import n’est pas à valider.');
          }
          await activateImport(tx, row, request.user!.id);
          const updated = await tx.query.reportImport.findFirst({
            where: eq(reportImport.id, row.id),
          });
          return toImport(tx, updated!);
        });
        return result ?? fail(reply, 404, 'Import introuvable');
      } catch (error) {
        if (error instanceof ActivationError) return fail(reply, 409, error.message);
        throw error;
      }
    },
  );
};
