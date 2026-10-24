import {
  buildingInputSchema,
  buildingSchema,
  equipmentInputSchema,
  equipmentSchema,
  equipmentUpdateSchema,
  floorDetailSchema,
  floorInputSchema,
  floorPlanPrefix,
  floorSchema,
  PLAN_IMAGE_MAX_BYTES,
  PLAN_IMAGE_TYPES,
  PLAN_SOURCE_MAX_BYTES,
  planConfirmSchema,
  planUploadRequestSchema,
  planUploadResponseSchema,
  siteInputSchema,
  siteSchema,
  type PlanPosition,
} from '@obsio/shared';
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Guards } from '../auth/guards.js';
import { withOrganisation, type Database, type Transaction } from '../db/client.js';
import { building, equipment, floor, site } from '../db/schema/index.js';
import type { Storage } from '../storage.js';

// Sites, bâtiments, étages, plans et équipements. Lecture pour tout membre, modification pour
// l'admin. Rien n'est supprimé : « archive » masque la ligne des listes.

const idParams = z.object({ id: z.uuid() });
const messageSchema = z.object({ message: z.string() });
const notFound = { 404: messageSchema };

type SiteRow = typeof site.$inferSelect;
type BuildingRow = typeof building.$inferSelect;
type FloorRow = typeof floor.$inferSelect;
type EquipmentRow = typeof equipment.$inferSelect;

const toSite = (row: SiteRow) => ({ id: row.id, name: row.name, address: row.address });
const toBuilding = (row: BuildingRow) => ({ id: row.id, siteId: row.siteId, name: row.name });
const toFloor = (row: FloorRow) => ({
  id: row.id,
  buildingId: row.buildingId,
  name: row.name,
  level: row.level,
  plan:
    row.planImageKey && row.planWidth && row.planHeight
      ? { width: row.planWidth, height: row.planHeight }
      : null,
});
const toEquipment = (row: EquipmentRow) => ({
  id: row.id,
  floorId: row.floorId,
  type: row.type,
  name: row.name,
  aliases: row.aliases,
  position: row.x !== null && row.y !== null ? { x: row.x, y: row.y } : null,
});
const positionColumns = (position: PlanPosition | null) => ({
  x: position?.x ?? null,
  y: position?.y ?? null,
});

const extension = (contentType: string) =>
  ({
    'application/pdf': 'pdf',
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
  })[contentType] ?? 'bin';

export const premisesRoutes: FastifyPluginAsyncZod<{
  db: Database;
  guards: Guards;
  storage: Storage;
}> = async (app, { db, guards, storage }) => {
  const { requireOrganisation: member, requireAdmin: admin } = guards;

  /** Transaction cloisonnée sur l'organisation active de la requête. */
  const scoped = <T>(request: FastifyRequest, fn: (tx: Transaction) => Promise<T>) =>
    withOrganisation(db, request.organisation!.id, fn);

  const missing = (reply: FastifyReply, what: string) =>
    reply.code(404).send({ message: `${what} introuvable` });

  // Lignes actives (non archivées) de l'organisation ; la RLS fait le reste du filtrage.
  const activeSite = (tx: Transaction, id: string) =>
    tx.query.site.findFirst({ where: and(eq(site.id, id), isNull(site.archivedAt)) });
  const activeBuilding = (tx: Transaction, id: string) =>
    tx.query.building.findFirst({ where: and(eq(building.id, id), isNull(building.archivedAt)) });
  const activeFloor = (tx: Transaction, id: string) =>
    tx.query.floor.findFirst({ where: and(eq(floor.id, id), isNull(floor.archivedAt)) });

  // --- Sites

  app.get(
    '/api/sites',
    { preHandler: member, schema: { response: { 200: z.array(siteSchema) } } },
    async (request) => {
      const rows = await scoped(request, (tx) =>
        tx.select().from(site).where(isNull(site.archivedAt)).orderBy(asc(site.name)),
      );
      return rows.map(toSite);
    },
  );

  app.get(
    '/api/sites/:id',
    {
      preHandler: member,
      schema: { params: idParams, response: { 200: siteSchema, ...notFound } },
    },
    async (request, reply) => {
      const row = await scoped(request, (tx) => activeSite(tx, request.params.id));
      return row ? toSite(row) : missing(reply, 'Site');
    },
  );

  app.post(
    '/api/sites',
    { preHandler: admin, schema: { body: siteInputSchema, response: { 201: siteSchema } } },
    async (request, reply) => {
      const [row] = await scoped(request, (tx) =>
        tx
          .insert(site)
          .values({ organisationId: request.organisation!.id, ...request.body })
          .returning(),
      );
      return reply.code(201).send(toSite(row!));
    },
  );

  app.patch(
    '/api/sites/:id',
    {
      preHandler: admin,
      schema: {
        params: idParams,
        body: siteInputSchema.partial(),
        response: { 200: siteSchema, ...notFound },
      },
    },
    async (request, reply) => {
      const [row] = await scoped(request, (tx) =>
        tx
          .update(site)
          .set(request.body)
          .where(and(eq(site.id, request.params.id), isNull(site.archivedAt)))
          .returning(),
      );
      return row ? toSite(row) : missing(reply, 'Site');
    },
  );

  // --- Bâtiments

  app.get(
    '/api/sites/:id/buildings',
    {
      preHandler: member,
      schema: { params: idParams, response: { 200: z.array(buildingSchema), ...notFound } },
    },
    async (request, reply) => {
      const rows = await scoped(request, async (tx) => {
        if (!(await activeSite(tx, request.params.id))) return null;
        return tx
          .select()
          .from(building)
          .where(and(eq(building.siteId, request.params.id), isNull(building.archivedAt)))
          .orderBy(asc(building.name));
      });
      return rows ? rows.map(toBuilding) : missing(reply, 'Site');
    },
  );

  app.post(
    '/api/sites/:id/buildings',
    {
      preHandler: admin,
      schema: {
        params: idParams,
        body: buildingInputSchema,
        response: { 201: buildingSchema, ...notFound },
      },
    },
    async (request, reply) => {
      const row = await scoped(request, async (tx) => {
        if (!(await activeSite(tx, request.params.id))) return null;
        const [created] = await tx
          .insert(building)
          .values({
            organisationId: request.organisation!.id,
            siteId: request.params.id,
            ...request.body,
          })
          .returning();
        return created!;
      });
      return row ? reply.code(201).send(toBuilding(row)) : missing(reply, 'Site');
    },
  );

  app.patch(
    '/api/buildings/:id',
    {
      preHandler: admin,
      schema: {
        params: idParams,
        body: buildingInputSchema.partial(),
        response: { 200: buildingSchema, ...notFound },
      },
    },
    async (request, reply) => {
      const [row] = await scoped(request, (tx) =>
        tx
          .update(building)
          .set(request.body)
          .where(and(eq(building.id, request.params.id), isNull(building.archivedAt)))
          .returning(),
      );
      return row ? toBuilding(row) : missing(reply, 'Bâtiment');
    },
  );

  // --- Étages

  app.get(
    '/api/buildings/:id/floors',
    {
      preHandler: member,
      schema: { params: idParams, response: { 200: z.array(floorSchema), ...notFound } },
    },
    async (request, reply) => {
      const rows = await scoped(request, async (tx) => {
        if (!(await activeBuilding(tx, request.params.id))) return null;
        return tx
          .select()
          .from(floor)
          .where(and(eq(floor.buildingId, request.params.id), isNull(floor.archivedAt)))
          .orderBy(asc(floor.level), asc(floor.name));
      });
      return rows ? rows.map(toFloor) : missing(reply, 'Bâtiment');
    },
  );

  app.post(
    '/api/buildings/:id/floors',
    {
      preHandler: admin,
      schema: {
        params: idParams,
        body: floorInputSchema,
        response: { 201: floorSchema, ...notFound },
      },
    },
    async (request, reply) => {
      const row = await scoped(request, async (tx) => {
        if (!(await activeBuilding(tx, request.params.id))) return null;
        const [created] = await tx
          .insert(floor)
          .values({
            organisationId: request.organisation!.id,
            buildingId: request.params.id,
            ...request.body,
          })
          .returning();
        return created!;
      });
      return row ? reply.code(201).send(toFloor(row)) : missing(reply, 'Bâtiment');
    },
  );

  app.get(
    '/api/floors/:id',
    {
      preHandler: member,
      schema: { params: idParams, response: { 200: floorDetailSchema, ...notFound } },
    },
    async (request, reply) => {
      const found = await scoped(request, async (tx) => {
        const row = await activeFloor(tx, request.params.id);
        if (!row) return null;
        // Bâtiment et site pour le cartouche du plan.
        const [parents] = await tx
          .select({
            building: { id: building.id, name: building.name },
            site: { id: site.id, name: site.name },
          })
          .from(building)
          .innerJoin(site, eq(site.id, building.siteId))
          .where(eq(building.id, row.buildingId));
        return { row, ...parents! };
      });
      if (!found) return missing(reply, 'Étage');
      const { row } = found;
      const { plan, ...rest } = toFloor(row);
      const context = { ...rest, building: found.building, site: found.site };
      if (!plan) return { ...context, plan: null };
      const [imageUrl, sourceUrl] = await Promise.all([
        storage.signedDownloadUrl(row.planImageKey!),
        row.planSourceKey ? storage.signedDownloadUrl(row.planSourceKey) : null,
      ]);
      return { ...context, plan: { ...plan, imageUrl, sourceUrl } };
    },
  );

  app.patch(
    '/api/floors/:id',
    {
      preHandler: admin,
      schema: {
        params: idParams,
        body: floorInputSchema.partial(),
        response: { 200: floorSchema, ...notFound },
      },
    },
    async (request, reply) => {
      const [row] = await scoped(request, (tx) =>
        tx
          .update(floor)
          .set(request.body)
          .where(and(eq(floor.id, request.params.id), isNull(floor.archivedAt)))
          .returning(),
      );
      return row ? toFloor(row) : missing(reply, 'Étage');
    },
  );

  // --- Plan d'un étage : envoi direct au stockage, puis confirmation.

  app.post(
    '/api/floors/:id/plan/uploads',
    {
      preHandler: admin,
      schema: {
        params: idParams,
        body: planUploadRequestSchema,
        response: { 200: planUploadResponseSchema, ...notFound },
      },
    },
    async (request, reply) => {
      const row = await scoped(request, (tx) => activeFloor(tx, request.params.id));
      if (!row) return missing(reply, 'Étage');
      const prefix = floorPlanPrefix(request.organisation!.id, row.id);
      const upload = crypto.randomUUID();
      const { source, image } = request.body;
      return {
        source: source
          ? await storage.presignedUpload(
              `${prefix}${upload}-source.${extension(source.contentType)}`,
              source.contentType,
              PLAN_SOURCE_MAX_BYTES,
            )
          : null,
        image: await storage.presignedUpload(
          `${prefix}${upload}-image.${extension(image.contentType)}`,
          image.contentType,
          PLAN_IMAGE_MAX_BYTES,
        ),
      };
    },
  );

  app.put(
    '/api/floors/:id/plan',
    {
      preHandler: admin,
      schema: {
        params: idParams,
        body: planConfirmSchema,
        response: { 200: floorSchema, 400: messageSchema, ...notFound },
      },
    },
    async (request, reply) => {
      const { imageKey, sourceKey, width, height } = request.body;
      const prefix = floorPlanPrefix(request.organisation!.id, request.params.id);
      // Les clés doivent venir d'un envoi signé pour cet étage, et les fichiers être arrivés.
      if (![imageKey, sourceKey].every((key) => key === null || key.startsWith(prefix))) {
        return reply.code(400).send({ message: "Fichier de plan étranger à l'étage" });
      }
      const imageType = await storage.contentType(imageKey);
      if (!imageType || !(PLAN_IMAGE_TYPES as readonly string[]).includes(imageType)) {
        return reply.code(400).send({ message: "Image du plan introuvable ou d'un type refusé" });
      }
      if (sourceKey && !(await storage.contentType(sourceKey))) {
        return reply.code(400).send({ message: "Fichier d'origine du plan introuvable" });
      }
      const [row] = await scoped(request, (tx) =>
        tx
          .update(floor)
          .set({
            planImageKey: imageKey,
            planSourceKey: sourceKey,
            planWidth: width,
            planHeight: height,
          })
          .where(and(eq(floor.id, request.params.id), isNull(floor.archivedAt)))
          .returning(),
      );
      return row ? toFloor(row) : missing(reply, 'Étage');
    },
  );

  // --- Équipements

  app.get(
    '/api/floors/:id/equipment',
    {
      preHandler: member,
      schema: { params: idParams, response: { 200: z.array(equipmentSchema), ...notFound } },
    },
    async (request, reply) => {
      const rows = await scoped(request, async (tx) => {
        if (!(await activeFloor(tx, request.params.id))) return null;
        return tx
          .select()
          .from(equipment)
          .where(and(eq(equipment.floorId, request.params.id), isNull(equipment.archivedAt)))
          .orderBy(asc(equipment.name));
      });
      return rows ? rows.map(toEquipment) : missing(reply, 'Étage');
    },
  );

  app.post(
    '/api/floors/:id/equipment',
    {
      preHandler: admin,
      schema: {
        params: idParams,
        body: equipmentInputSchema,
        response: { 201: equipmentSchema, ...notFound },
      },
    },
    async (request, reply) => {
      const { position, ...fields } = request.body;
      const row = await scoped(request, async (tx) => {
        if (!(await activeFloor(tx, request.params.id))) return null;
        const [created] = await tx
          .insert(equipment)
          .values({
            organisationId: request.organisation!.id,
            floorId: request.params.id,
            ...fields,
            ...positionColumns(position),
          })
          .returning();
        return created!;
      });
      return row ? reply.code(201).send(toEquipment(row)) : missing(reply, 'Étage');
    },
  );

  app.patch(
    '/api/equipment/:id',
    {
      preHandler: admin,
      schema: {
        params: idParams,
        body: equipmentUpdateSchema,
        response: { 200: equipmentSchema, ...notFound },
      },
    },
    async (request, reply) => {
      const { position, ...fields } = request.body;
      const [row] = await scoped(request, (tx) =>
        tx
          .update(equipment)
          .set({ ...fields, ...(position !== undefined ? positionColumns(position) : {}) })
          .where(and(eq(equipment.id, request.params.id), isNull(equipment.archivedAt)))
          .returning(),
      );
      return row ? toEquipment(row) : missing(reply, 'Équipement');
    },
  );

  // --- Archivage (jamais de suppression physique)

  const archivable = [
    { path: 'sites', table: site, label: 'Site' },
    { path: 'buildings', table: building, label: 'Bâtiment' },
    { path: 'floors', table: floor, label: 'Étage' },
    { path: 'equipment', table: equipment, label: 'Équipement' },
  ] as const;

  for (const { path, table, label } of archivable) {
    app.post(
      `/api/${path}/:id/archive`,
      { preHandler: admin, schema: { params: idParams, response: { 204: z.null(), ...notFound } } },
      async (request, reply) => {
        const [row] = await scoped(request, (tx) =>
          tx
            .update(table)
            .set({ archivedAt: new Date() })
            .where(and(eq(table.id, request.params.id), isNull(table.archivedAt)))
            .returning({ id: table.id }),
        );
        return row ? reply.code(204).send(null) : missing(reply, label);
      },
    );
  }
};
