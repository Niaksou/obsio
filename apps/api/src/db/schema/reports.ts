import {
  DRAFT_DECISIONS,
  IMPORT_STATUSES,
  RESERVE_STATUSES,
  type ExtractedReserve,
  type ExtractionTrace,
  type Q18Summary,
  type Q19Summary,
} from '@obsio/shared';
import {
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { user } from './auth.js';
import { id, organisationId, organisationIsolation, timestamps } from './columns.js';
import { equipment } from './premises.js';
import { site } from './site.js';

// Import d'un rapport (J3) : un PDF déposé produit des documents (rapport du Code du travail,
// Q18, Q19) et des brouillons de réserves ; à la validation, les brouillons deviennent des
// réserves avec une ou plusieurs sources. Rien n'est supprimé physiquement.

export const importStatus = pgEnum('import_status', IMPORT_STATUSES);
export const documentType = pgEnum('document_type', [
  'periodique',
  'initiale',
  'q18',
  'q19',
  'autre',
]);
export const draftDecision = pgEnum('draft_decision', DRAFT_DECISIONS);
export const draftOrigin = pgEnum('draft_origin', ['extraction', 'constatation_q18']);
export const reserveStatus = pgEnum('reserve_status', RESERVE_STATUSES);

export const reportImport = pgTable(
  'report_import',
  {
    id: id(),
    organisationId: organisationId(),
    siteId: uuid('site_id').notNull(),
    fileName: text('file_name').notNull(),
    pdfKey: text('pdf_key').notNull(),
    status: importStatus('status').notNull().default('en_analyse'),
    error: text('error'),
    /** Versions des modèles et du prompt ; la sortie brute complète reste dans extraction.json. */
    trace: jsonb('trace').$type<ExtractionTrace>(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => user.id),
    validatedAt: timestamp('validated_at', { withTimezone: true }),
    validatedBy: uuid('validated_by').references(() => user.id),
    ...timestamps,
  },
  (table) => [
    index().on(table.organisationId),
    index().on(table.siteId),
    unique().on(table.id, table.organisationId),
    foreignKey({
      columns: [table.siteId, table.organisationId],
      foreignColumns: [site.id, site.organisationId],
    }),
    organisationIsolation('report_import'),
  ],
);

/** RapportVerification de la spec : un document du PDF importé. */
export const reportDocument = pgTable(
  'report_document',
  {
    id: id(),
    organisationId: organisationId(),
    importId: uuid('import_id').notNull(),
    siteId: uuid('site_id').notNull(),
    position: integer('position').notNull(),
    type: documentType('type').notNull(),
    organisme: text('organisme').notNull(),
    numeroRapport: text('numero_rapport'),
    dateVisite: date('date_visite', { mode: 'string' }),
    q18: jsonb('q18').$type<Q18Summary>(),
    q19: jsonb('q19').$type<Q19Summary>(),
    ...timestamps,
  },
  (table) => [
    index().on(table.organisationId),
    index().on(table.importId),
    index().on(table.siteId),
    unique().on(table.id, table.organisationId),
    foreignKey({
      columns: [table.importId, table.organisationId],
      foreignColumns: [reportImport.id, reportImport.organisationId],
    }),
    foreignKey({
      columns: [table.siteId, table.organisationId],
      foreignColumns: [site.id, site.organisationId],
    }),
    organisationIsolation('report_document'),
  ],
);

export const reserve = pgTable(
  'reserve',
  {
    id: id(),
    organisationId: organisationId(),
    siteId: uuid('site_id').notNull(),
    equipmentId: uuid('equipment_id'),
    description: text('description').notNull(),
    preconisation: text('preconisation'),
    /** Gravité ou priorité telle qu'écrite dans le rapport. */
    gravite: text('gravite'),
    status: reserveStatus('status').notNull().default('ouverte'),
    dueDate: date('due_date', { mode: 'string' }),
    /** Réserve de l'import précédent que celle-ci reconduit (historique de l'équipement). */
    reconduiteDeId: uuid('reconduite_de_id'),
    importId: uuid('import_id').notNull(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index().on(table.organisationId),
    index().on(table.siteId),
    index().on(table.equipmentId),
    unique().on(table.id, table.organisationId),
    foreignKey({
      columns: [table.siteId, table.organisationId],
      foreignColumns: [site.id, site.organisationId],
    }),
    foreignKey({
      columns: [table.equipmentId, table.organisationId],
      foreignColumns: [equipment.id, equipment.organisationId],
    }),
    foreignKey({
      columns: [table.reconduiteDeId, table.organisationId],
      foreignColumns: [table.id, table.organisationId],
    }),
    foreignKey({
      columns: [table.importId, table.organisationId],
      foreignColumns: [reportImport.id, reportImport.organisationId],
    }),
    organisationIsolation('reserve'),
  ],
);

/** ReserveBrouillon de la spec. */
export const draftReserve = pgTable(
  'draft_reserve',
  {
    id: id(),
    organisationId: organisationId(),
    importId: uuid('import_id').notNull(),
    documentId: uuid('document_id').notNull(),
    position: integer('position').notNull(),
    origin: draftOrigin('origin').notNull().default('extraction'),
    extracted: jsonb('extracted').$type<ExtractedReserve>().notNull(),
    confiance: real('confiance'),
    description: text('description').notNull(),
    preconisation: text('preconisation'),
    gravite: text('gravite'),
    equipmentId: uuid('equipment_id'),
    proposedEquipmentId: uuid('proposed_equipment_id'),
    reconduiteDeId: uuid('reconduite_de_id'),
    proposedReconduiteDeId: uuid('proposed_reconduite_de_id'),
    mergeIntoId: uuid('merge_into_id'),
    proposedMergeIntoId: uuid('proposed_merge_into_id'),
    decision: draftDecision('decision').notNull().default('a_valider'),
    /** Réserve créée (ou complétée d'une source) à la validation. */
    reserveId: uuid('reserve_id'),
    ...timestamps,
  },
  (table) => [
    index().on(table.organisationId),
    index().on(table.importId),
    unique().on(table.id, table.organisationId),
    foreignKey({
      columns: [table.importId, table.organisationId],
      foreignColumns: [reportImport.id, reportImport.organisationId],
    }),
    foreignKey({
      columns: [table.documentId, table.organisationId],
      foreignColumns: [reportDocument.id, reportDocument.organisationId],
    }),
    foreignKey({
      columns: [table.equipmentId, table.organisationId],
      foreignColumns: [equipment.id, equipment.organisationId],
    }),
    foreignKey({
      columns: [table.reconduiteDeId, table.organisationId],
      foreignColumns: [reserve.id, reserve.organisationId],
    }),
    foreignKey({
      columns: [table.mergeIntoId, table.organisationId],
      foreignColumns: [table.id, table.organisationId],
    }),
    foreignKey({
      columns: [table.reserveId, table.organisationId],
      foreignColumns: [reserve.id, reserve.organisationId],
    }),
    organisationIsolation('draft_reserve'),
  ],
);

/** SourceReserve de la spec : relie une réserve à chaque document qui la signale. */
export const reserveSource = pgTable(
  'reserve_source',
  {
    id: id(),
    organisationId: organisationId(),
    reserveId: uuid('reserve_id').notNull(),
    documentId: uuid('document_id').notNull(),
    origin: draftOrigin('origin').notNull().default('extraction'),
    reference: text('reference').notNull(),
    codeObservation: text('code_observation'),
    description: text('description').notNull(),
    preconisation: text('preconisation'),
    articleReglementaire: text('article_reglementaire'),
    localisationTexte: text('localisation_texte'),
    gravite: text('gravite'),
    pageSource: integer('page_source').notNull(),
    constatationQ18: integer('constatation_q18'),
    thermique: jsonb('thermique').$type<ExtractedReserve['thermique']>(),
    ...timestamps,
  },
  (table) => [
    index().on(table.organisationId),
    index().on(table.reserveId),
    foreignKey({
      columns: [table.reserveId, table.organisationId],
      foreignColumns: [reserve.id, reserve.organisationId],
    }),
    foreignKey({
      columns: [table.documentId, table.organisationId],
      foreignColumns: [reportDocument.id, reportDocument.organisationId],
    }),
    organisationIsolation('reserve_source'),
  ],
);

/**
 * Journal d'audit (Evenement) : une ligne par action sur une réserve. L'application ne peut ni
 * modifier ni supprimer une ligne (droits retirés dans la migration).
 */
export const reserveEvent = pgTable(
  'reserve_event',
  {
    id: id(),
    organisationId: organisationId(),
    reserveId: uuid('reserve_id').notNull(),
    type: text('type').notNull(),
    /** Auteur : utilisateur connecté, ou intervenant via son lien (les deux null = système). */
    actorUserId: uuid('actor_user_id').references(() => user.id),
    actorContractorId: uuid('actor_contractor_id'),
    data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index().on(table.organisationId),
    index().on(table.reserveId),
    foreignKey({
      columns: [table.reserveId, table.organisationId],
      foreignColumns: [reserve.id, reserve.organisationId],
    }),
    organisationIsolation('reserve_event'),
  ],
);
