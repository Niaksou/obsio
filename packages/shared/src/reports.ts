import { z } from 'zod';
import {
  documentTypeSchema,
  extractedReserveSchema,
  q18SummarySchema,
  q19SummarySchema,
} from './extraction.js';

// Contrat de l'API pour l'import des rapports (J3) : dépôt, suivi, brouillons, validation.

export const IMPORT_STATUSES = ['en_analyse', 'a_valider', 'valide', 'erreur'] as const;
export const importStatusSchema = z.enum(IMPORT_STATUSES);
export type ImportStatus = z.infer<typeof importStatusSchema>;

export const IMPORT_STATUS_LABELS: Record<ImportStatus, string> = {
  en_analyse: 'En analyse',
  a_valider: 'À valider',
  valide: 'Validé',
  erreur: 'Erreur',
};

export const DOCUMENT_TYPE_LABELS: Record<z.infer<typeof documentTypeSchema>, string> = {
  periodique: 'Vérification périodique',
  initiale: 'Vérification initiale',
  q18: 'Compte rendu Q18',
  q19: 'Thermographie Q19',
  autre: 'Autre document',
};

/** Les 8 constatations standard du compte rendu Q18 (formulaire CNPP, référentiel APSAD D18). */
export const Q18_CONSTATATIONS: Record<number, string> = {
  1: "Présence de trace d'échauffement anormal d'une canalisation et/ou d'un matériel électrique",
  2: 'Absence des moyens de protection des transformateurs (HT/BT, BT/HT, HT/HT)',
  3: 'Absence ou inadaptation des dispositifs de protection contre les surintensités',
  4: 'Dysfonctionnement des dispositifs différentiels à courant résiduel',
  5: 'Présence de poussière déposée ou de substances de nature à provoquer un danger dans les armoires',
  6: "Inadéquation des matériels ou des canalisations électriques dans les locaux à risques d'incendie et/ou zones à risques d'explosion",
  7: "Défaut de continuité du conducteur de protection dans les locaux à risques d'incendie et/ou zones à risques d'explosion",
  8: "Existence de locaux à risques d'incendie et/ou zones à risque d'explosion dont l'installation ne répond à aucune des deux conditions prévues",
};

/** PDF du rapport : taille maximale acceptée au dépôt. */
export const REPORT_MAX_BYTES = 50 * 1024 * 1024;

export const reportUploadRequestSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  size: z.int().positive().max(REPORT_MAX_BYTES),
});

export const reportImportCreateSchema = z.object({
  key: z.string().min(1),
  fileName: z.string().trim().min(1).max(255),
});

export const reportImportSchema = z.object({
  id: z.uuid(),
  siteId: z.uuid(),
  fileName: z.string(),
  status: importStatusSchema,
  error: z.string().nullable(),
  createdAt: z.iso.datetime(),
  validatedAt: z.iso.datetime().nullable(),
  /** Nombre de brouillons (avant validation) ou de réserves créées (après). */
  reserveCount: z.int().nonnegative(),
});
export type ReportImport = z.infer<typeof reportImportSchema>;

export const reportDocumentSchema = z.object({
  id: z.uuid(),
  type: documentTypeSchema,
  organisme: z.string(),
  numeroRapport: z.string().nullable(),
  dateVisite: z.iso.date().nullable(),
  q18: q18SummarySchema.nullable(),
  q19: q19SummarySchema.nullable(),
});
export type ReportDocument = z.infer<typeof reportDocumentSchema>;

export const DRAFT_DECISIONS = ['a_valider', 'retenue', 'ecartee'] as const;
export const draftDecisionSchema = z.enum(DRAFT_DECISIONS);
export type DraftDecision = z.infer<typeof draftDecisionSchema>;

/** Origine d'un brouillon : point extrait du rapport, ou constatation Q18 sans point rattaché. */
export const draftOriginSchema = z.enum(['extraction', 'constatation_q18']);

export const draftReserveSchema = z.object({
  id: z.uuid(),
  documentId: z.uuid(),
  origin: draftOriginSchema,
  /** Champs tels qu'extraits (lecture seule), pour comparer avec les corrections. */
  extracted: extractedReserveSchema,
  confiance: z.number().nullable(),
  // Champs relus par l'utilisateur.
  description: z.string(),
  preconisation: z.string().nullable(),
  gravite: z.string().nullable(),
  equipmentId: z.uuid().nullable(),
  proposedEquipmentId: z.uuid().nullable(),
  /** Réserve ouverte d'un import précédent dont celle-ci est la reconduite. */
  reconduiteDeId: z.uuid().nullable(),
  proposedReconduiteDeId: z.uuid().nullable(),
  /** Même anomalie qu'un autre brouillon de l'import (autre document) : une réserve, deux sources. */
  mergeIntoId: z.uuid().nullable(),
  proposedMergeIntoId: z.uuid().nullable(),
  decision: draftDecisionSchema,
});
export type DraftReserve = z.infer<typeof draftReserveSchema>;

export const draftUpdateSchema = z
  .object({
    description: z.string().trim().min(1).max(5000),
    preconisation: z.string().trim().max(5000).nullable(),
    gravite: z.string().trim().max(200).nullable(),
    equipmentId: z.uuid().nullable(),
    reconduiteDeId: z.uuid().nullable(),
    mergeIntoId: z.uuid().nullable(),
    decision: draftDecisionSchema,
  })
  .partial();
export type DraftUpdate = z.infer<typeof draftUpdateSchema>;

/** Réserve d'un import précédent, proposée comme origine d'une reconduite. */
export const reconductionCandidateSchema = z.object({
  id: z.uuid(),
  description: z.string(),
  equipmentId: z.uuid().nullable(),
  reference: z.string().nullable(),
});

export const reportImportDetailSchema = reportImportSchema.extend({
  pdfUrl: z.url(),
  documents: z.array(reportDocumentSchema),
  drafts: z.array(draftReserveSchema),
  /** Réserves ouvertes du site, pour choisir l'origine d'une reconduite. */
  openReserves: z.array(reconductionCandidateSchema),
});
export type ReportImportDetail = z.infer<typeof reportImportDetailSchema>;

// --- Réserves actives (J3 : création à la validation ; J4 : suivi).

export const RESERVE_STATUSES = ['ouverte', 'assignee', 'corrigee', 'levee'] as const;
export const reserveStatusSchema = z.enum(RESERVE_STATUSES);
export type ReserveStatus = z.infer<typeof reserveStatusSchema>;

export const RESERVE_STATUS_LABELS: Record<ReserveStatus, string> = {
  ouverte: 'Ouverte',
  assignee: 'Assignée',
  corrigee: 'Corrigée',
  levee: 'Levée',
};
