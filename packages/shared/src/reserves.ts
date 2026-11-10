import { z } from 'zod';
import { documentTypeSchema, extractedReserveSchema } from './extraction.js';
import { planPositionSchema } from './premises.js';
import { reserveStatusSchema } from './reports.js';

// Contrat de l'API pour le suivi des réserves (J4), les assignations et les preuves (J5).

export const reserveEquipmentSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  floorId: z.uuid(),
  floorName: z.string(),
  buildingName: z.string(),
  position: planPositionSchema.nullable(),
});

export const reserveListItemSchema = z.object({
  id: z.uuid(),
  siteId: z.uuid(),
  description: z.string(),
  preconisation: z.string().nullable(),
  gravite: z.string().nullable(),
  status: reserveStatusSchema,
  dueDate: z.iso.date().nullable(),
  /** Échéance dépassée et réserve pas encore corrigée. */
  overdue: z.boolean(),
  /** Reconduite d'une réserve d'un import précédent. */
  reconduite: z.boolean(),
  equipment: reserveEquipmentSchema.nullable(),
  sources: z.array(z.object({ documentType: documentTypeSchema, reference: z.string() })),
  assignedTo: z.object({ name: z.string(), company: z.string().nullable() }).nullable(),
  /** Collaborateurs (membres de l'organisation) chargés de la corriger. */
  collaborators: z.array(z.object({ id: z.uuid(), name: z.string() })),
  createdAt: z.iso.datetime(),
});
export type ReserveListItem = z.infer<typeof reserveListItemSchema>;

export const reserveFiltersSchema = z.object({
  status: reserveStatusSchema.optional(),
  /** Réserves en cours (ni corrigées ni levées), le défaut de la liste. */
  open: z.enum(['true', 'false']).optional(),
  overdue: z.enum(['true', 'false']).optional(),
  equipmentId: z.uuid().optional(),
  floorId: z.uuid().optional(),
  documentType: documentTypeSchema.optional(),
  /** Réserves confiées à l'utilisateur connecté. */
  mine: z.enum(['true', 'false']).optional(),
});
export type ReserveFilters = z.infer<typeof reserveFiltersSchema>;

export const reserveSourceSchema = z.object({
  id: z.uuid(),
  importId: z.uuid(),
  documentType: documentTypeSchema,
  organisme: z.string(),
  dateVisite: z.iso.date().nullable(),
  origin: z.enum(['extraction', 'constatation_q18']),
  ...extractedReserveSchema.pick({
    reference: true,
    codeObservation: true,
    description: true,
    preconisation: true,
    articleReglementaire: true,
    localisationTexte: true,
    gravite: true,
    pageSource: true,
    constatationQ18: true,
    thermique: true,
  }).shape,
});

export const reserveEventSchema = z.object({
  id: z.uuid(),
  type: z.string(),
  createdAt: z.iso.datetime(),
  /** Nom de l'auteur (utilisateur ou intervenant), null pour une action de l'application. */
  actor: z.string().nullable(),
  data: z.record(z.string(), z.unknown()),
});
export type ReserveEvent = z.infer<typeof reserveEventSchema>;

export const proofSchema = z.object({
  id: z.uuid(),
  comment: z.string().nullable(),
  photos: z.array(z.object({ url: z.url() })),
  author: z.string(),
  createdAt: z.iso.datetime(),
});
export type Proof = z.infer<typeof proofSchema>;

export const assignmentSummarySchema = z.object({
  id: z.uuid(),
  contractor: z.object({ id: z.uuid(), name: z.string(), company: z.string().nullable() }),
  dueDate: z.iso.date().nullable(),
  expiresAt: z.iso.datetime(),
  revokedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export type AssignmentSummary = z.infer<typeof assignmentSummarySchema>;

export const reserveDetailSchema = reserveListItemSchema.extend({
  sources: z.array(reserveSourceSchema),
  events: z.array(reserveEventSchema),
  proofs: z.array(proofSchema),
  assignments: z.array(assignmentSummarySchema),
  /** Réserves des imports précédents dont celle-ci est la reconduite, de la plus récente à la plus ancienne. */
  history: z.array(
    z.object({
      id: z.uuid(),
      description: z.string(),
      status: reserveStatusSchema,
      createdAt: z.iso.datetime(),
    }),
  ),
});
export type ReserveDetail = z.infer<typeof reserveDetailSchema>;

export const reserveUpdateSchema = z
  .object({
    description: z.string().trim().min(1).max(5000),
    preconisation: z.string().trim().max(5000).nullable(),
    gravite: z.string().trim().max(200).nullable(),
    dueDate: z.iso.date().nullable(),
    equipmentId: z.uuid().nullable(),
  })
  .partial();
export type ReserveUpdate = z.infer<typeof reserveUpdateSchema>;

export const commentInputSchema = z.object({ text: z.string().trim().min(1).max(5000) });

/** Clôture par le responsable, ou refus de la correction (retour à corriger). */
export const reserveReviewSchema = z.object({
  decision: z.enum(['lever', 'refuser']),
  comment: z.string().trim().max(5000).nullable().default(null),
});

// --- Intervenants et assignations

export const contractorSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  company: z.string().nullable(),
  email: z.string(),
});
export type Contractor = z.infer<typeof contractorSchema>;

export const contractorInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  company: z
    .string()
    .trim()
    .max(200)
    .transform((value) => value || null)
    .nullable()
    .default(null),
  email: z.email().trim().toLowerCase(),
});
export type ContractorInput = z.infer<typeof contractorInputSchema>;

export const ASSIGNMENT_DEFAULT_DAYS = 30;

export const assignmentInputSchema = z.object({
  contractorId: z.uuid(),
  reserveIds: z.array(z.uuid()).min(1).max(500),
  dueDate: z.iso.date().nullable(),
  message: z
    .string()
    .trim()
    .max(2000)
    .transform((value) => value || null)
    .nullable()
    .default(null),
  /** Durée de validité du lien, en jours. */
  validityDays: z.int().min(1).max(365).default(ASSIGNMENT_DEFAULT_DAYS),
});
export type AssignmentInput = z.infer<typeof assignmentInputSchema>;

export const assignmentCreatedSchema = assignmentSummarySchema.extend({
  /** Lien de l'intervenant, montré une seule fois (seule l'empreinte du jeton est stockée). */
  link: z.url(),
});

// --- Collaborateurs (membres de l'organisation)

export const collaboratorAssignmentInputSchema = z.object({
  userIds: z.array(z.uuid()).min(1).max(50),
  reserveIds: z.array(z.uuid()).min(1).max(500),
  dueDate: z.iso.date().nullable().default(null),
  message: z
    .string()
    .trim()
    .max(2000)
    .transform((value) => value || null)
    .nullable()
    .default(null),
});
export type CollaboratorAssignmentInput = z.input<typeof collaboratorAssignmentInputSchema>;

/** Réserve confiée à l'utilisateur connecté, tous sites confondus. */
export const myReserveSchema = reserveListItemSchema.extend({ siteName: z.string() });
export type MyReserve = z.infer<typeof myReserveSchema>;

// --- Preuves (membres et intervenants)

export const PROOF_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const PROOF_PHOTO_MAX_BYTES = 15 * 1024 * 1024;
export const PROOF_MAX_PHOTOS = 6;

export const photoUploadRequestSchema = z.object({
  reserveId: z.uuid(),
  contentType: z.enum(PROOF_PHOTO_TYPES),
  size: z.int().positive().max(PROOF_PHOTO_MAX_BYTES),
});

export const proofInputSchema = z.object({
  /** Choisi par l'appareil : rejouer l'envoi (file hors ligne) ne crée pas de doublon. */
  clientId: z.uuid(),
  comment: z
    .string()
    .trim()
    .max(5000)
    .transform((value) => value || null)
    .nullable()
    .default(null),
  photoKeys: z.array(z.string().min(1)).max(PROOF_MAX_PHOTOS).default([]),
  /** Passe la réserve au statut « corrigée ». */
  markCorrected: z.boolean().default(false),
});
export type ProofInput = z.infer<typeof proofInputSchema>;

// --- Vue de l'intervenant (lien signé, sans compte)

export const interventionReserveSchema = z.object({
  id: z.uuid(),
  description: z.string(),
  preconisation: z.string().nullable(),
  gravite: z.string().nullable(),
  status: reserveStatusSchema,
  dueDate: z.iso.date().nullable(),
  localisation: z.string().nullable(),
  equipment: z
    .object({ name: z.string(), floorName: z.string(), buildingName: z.string() })
    .nullable(),
  proofs: z.array(proofSchema),
});
export type InterventionReserve = z.infer<typeof interventionReserveSchema>;

export const interventionSchema = z.object({
  organisationName: z.string(),
  siteNames: z.array(z.string()),
  contractorName: z.string(),
  dueDate: z.iso.date().nullable(),
  message: z.string().nullable(),
  expiresAt: z.iso.datetime(),
  reserves: z.array(interventionReserveSchema),
});
export type Intervention = z.infer<typeof interventionSchema>;

// --- Pilotage (J6)

export const siteDashboardSchema = z.object({
  counts: z.object({
    /** Ouvertes ou assignées. */
    open: z.int(),
    overdue: z.int(),
    /** Corrigées, en attente de levée par l'admin. */
    toVerify: z.int(),
    /** En cours et déjà relevées lors d'une vérification précédente. */
    reconduites: z.int(),
    levees: z.int(),
  }),
  floors: z.array(
    z.object({
      floorId: z.uuid(),
      floorName: z.string(),
      buildingName: z.string(),
      open: z.int(),
      overdue: z.int(),
    }),
  ),
  /** Réserves en cours sans équipement rattaché. */
  unattached: z.int(),
  /** Dernier compte rendu Q18 validé du site. */
  q18: z
    .object({
      importId: z.uuid(),
      organisme: z.string(),
      dateVisite: z.iso.date().nullable(),
      conclusion: z.enum(['risque', 'pas_de_risque']).nullable(),
      /** Constatations standard cochées en danger (nouveau ou déjà signalé). */
      dangers: z.array(z.int()),
      nonVerifiees: z.array(z.int()),
    })
    .nullable(),
});
export type SiteDashboard = z.infer<typeof siteDashboardSchema>;

export const proofDossierQuerySchema = z.object({
  /** Dossier pour l'assureur (Q18, Q19) ou réglementaire (périodique…) ; tout par défaut. */
  documentType: documentTypeSchema.optional(),
  /** Réserves levées seulement, ou toutes avec leur état. */
  scope: z.enum(['levees', 'toutes']).default('toutes'),
});
export type ProofDossierQuery = z.input<typeof proofDossierQuerySchema>;
