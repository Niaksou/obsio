import { z } from 'zod';
import { equipmentTypeSchema } from './equipment.js';

// Contrat de l'API pour la hiérarchie du terrain : site → bâtiment → étage → équipement.

const name = z.string().trim().min(1, 'Nom requis').max(200);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null)
    .nullable();

export const siteSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  address: z.string().nullable(),
});
export type Site = z.infer<typeof siteSchema>;
export const siteInputSchema = z.object({ name, address: optionalText(500).default(null) });
export type SiteInput = z.infer<typeof siteInputSchema>;

export const buildingSchema = z.object({ id: z.uuid(), siteId: z.uuid(), name: z.string() });
export type Building = z.infer<typeof buildingSchema>;
export const buildingInputSchema = z.object({ name });
export type BuildingInput = z.infer<typeof buildingInputSchema>;

/** Plan d'un étage : dimensions de l'image affichée, en pixels. */
export const floorPlanSchema = z.object({ width: z.int().positive(), height: z.int().positive() });

export const floorSchema = z.object({
  id: z.uuid(),
  buildingId: z.uuid(),
  name: z.string(),
  level: z.int(),
  plan: floorPlanSchema.nullable(),
});
export type Floor = z.infer<typeof floorSchema>;

/** Étage avec les liens de lecture du plan (URL signées, valables quelques minutes). */
export const floorDetailSchema = floorSchema.extend({
  plan: floorPlanSchema.extend({ imageUrl: z.url(), sourceUrl: z.url().nullable() }).nullable(),
});
export type FloorDetail = z.infer<typeof floorDetailSchema>;

export const floorInputSchema = z.object({ name, level: z.int().min(-20).max(200).default(0) });
export type FloorInput = z.infer<typeof floorInputSchema>;

/** Position sur le plan, en proportion de la largeur et de la hauteur de l'image. */
export const planPositionSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});
export type PlanPosition = z.infer<typeof planPositionSchema>;

export const equipmentSchema = z.object({
  id: z.uuid(),
  floorId: z.uuid(),
  type: equipmentTypeSchema,
  name: z.string(),
  aliases: z.array(z.string()),
  position: planPositionSchema.nullable(),
});
export type Equipment = z.infer<typeof equipmentSchema>;

export const equipmentInputSchema = z.object({
  type: equipmentTypeSchema,
  /** Repère (« TD2 ») ou nom de la machine (« Presse 3 »). */
  name,
  aliases: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
  position: planPositionSchema.nullable().default(null),
});
export type EquipmentInput = z.infer<typeof equipmentInputSchema>;
export const equipmentUpdateSchema = equipmentInputSchema.partial();
export type EquipmentUpdate = z.infer<typeof equipmentUpdateSchema>;

// --- Dépôt du plan : le navigateur envoie les fichiers directement au stockage (URL signées).

export const PLAN_SOURCE_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
] as const;
export const PLAN_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export const PLAN_SOURCE_MAX_BYTES = 50 * 1024 * 1024;
export const PLAN_IMAGE_MAX_BYTES = 30 * 1024 * 1024;

export const planUploadRequestSchema = z.object({
  /** Fichier d'origine quand c'est un PDF ; absent si l'image déposée est elle-même le plan. */
  source: z
    .object({
      contentType: z.enum(PLAN_SOURCE_TYPES),
      size: z.int().positive().max(PLAN_SOURCE_MAX_BYTES),
    })
    .nullable(),
  image: z.object({
    contentType: z.enum(PLAN_IMAGE_TYPES),
    size: z.int().positive().max(PLAN_IMAGE_MAX_BYTES),
  }),
});
export type PlanUploadRequest = z.infer<typeof planUploadRequestSchema>;

/** Formulaire d'envoi signé (POST multipart vers le stockage). */
export const presignedPostSchema = z.object({
  key: z.string(),
  url: z.url(),
  fields: z.record(z.string(), z.string()),
});
export type PresignedPost = z.infer<typeof presignedPostSchema>;

export const planUploadResponseSchema = z.object({
  source: presignedPostSchema.nullable(),
  image: presignedPostSchema,
});

export const planConfirmSchema = z.object({
  imageKey: z.string().min(1),
  sourceKey: z.string().min(1).nullable(),
  width: z.int().positive().max(20_000),
  height: z.int().positive().max(20_000),
});
export type PlanConfirm = z.infer<typeof planConfirmSchema>;
