import {
  documentVerificationSchema,
  documentVerifyInputSchema,
  proofDossierQuerySchema,
  siteDashboardSchema,
} from '@obsio/shared';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Guards } from '../auth/guards.js';
import { withOrganisation, type Database } from '../db/client.js';
import { issuedDocument, organisation, site } from '../db/schema/index.js';
import type { ApiConfig } from '../config.js';
import { issueProofDossier } from '../documents/issue.js';
import { createDocumentSigner, type DocumentSigner } from '../documents/signing.js';
import { siteDashboard } from '../reserves/dashboard.js';
import { documentNumber } from '../reserves/dossier.js';
import { QUOTAS, type Quotas } from '../quotas.js';
import type { Storage } from '../storage.js';

// Pilotage (J6) : tableau de bord d'un site et dossier de preuves en PDF (signé, vérifiable),
// pour les admins et responsables.

const idParams = z.object({ id: z.uuid() });
const messageSchema = z.object({ message: z.string() });

export const dashboardRoutes: FastifyPluginAsyncZod<{
  db: Database;
  guards: Guards;
  storage: Storage;
  quotas: Quotas;
  config: ApiConfig;
}> = async (app, { db, guards, storage, quotas, config }) => {
  const member = guards.requireOrganisation;
  // Signataire créé à la première émission (le certificat de développement est tiré à ce moment).
  let documentSigner: DocumentSigner | null = null;
  const signer = () => (documentSigner ??= createDocumentSigner(config));

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

  // Émission d'un dossier de preuves : signé, enregistré (empreinte SHA-256) et téléchargé.
  app.post(
    '/api/sites/:id/proof-dossier',
    {
      preHandler: member,
      config: { readOnlyLicence: true },
      schema: { params: idParams, body: proofDossierQuerySchema },
    },
    async (request, reply) => {
      const organisationId = request.organisation!.id;
      await quotas.consume(QUOTAS.dossiers, organisationId);
      const issued = await withOrganisation(db, organisationId, async (tx) => {
        const found = await tx.query.site.findFirst({
          where: and(eq(site.id, request.params.id), isNull(site.archivedAt)),
        });
        if (!found) return null;
        return issueProofDossier(tx, storage, signer(), {
          organisation: { id: organisationId, name: request.organisation!.name },
          site: { id: found.id, name: found.name, address: found.address },
          user: { id: request.user!.id, name: request.user!.name },
          documentType: request.body.documentType,
          scope: request.body.scope,
          webUrl: config.WEB_URL,
        });
      });
      if (!issued) return reply.code(404).send({ message: 'Site introuvable' });
      const day = issued.issuedAt.toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
      return reply
        .type('application/pdf')
        .header(
          'Content-Disposition',
          `attachment; filename="dossier-preuves-${day}-${documentNumber(issued.id)}.pdf"`,
        )
        .send(issued.pdf);
    },
  );

  // Page publique « Vérifier un document » : le navigateur calcule l'empreinte du PDF déposé,
  // l'API dit si elle figure au registre. Rien d'autre que le strict minimum n'est renvoyé.
  app.post(
    '/api/documents/verify',
    {
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: {
        body: documentVerifyInputSchema,
        response: { 200: documentVerificationSchema, 404: messageSchema },
      },
    },
    async (request, reply) => {
      const found = await db.transaction(async (tx) => {
        await tx.execute(
          sql`select set_config('app.document_sha256', ${request.body.sha256}, true)`,
        );
        return tx.query.issuedDocument.findFirst({
          where: eq(issuedDocument.sha256, request.body.sha256),
        });
      });
      if (!found) {
        return reply.code(404).send({ message: 'Ce fichier ne figure pas au registre d’Obsio.' });
      }
      const org = await db.query.organisation.findFirst({
        where: eq(organisation.id, found.organisationId),
      });
      return {
        number: documentNumber(found.id),
        issuedAt: found.issuedAt.toISOString(),
        organisationName: org?.name ?? '',
        reserveCount: found.reserveCount,
        liftedCount: found.liftedCount,
      };
    },
  );
};
