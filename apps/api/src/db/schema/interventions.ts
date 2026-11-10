import { sql } from 'drizzle-orm';
import {
  date,
  foreignKey,
  index,
  pgPolicy,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { user } from './auth.js';
import { id, organisationId, organisationIsolation, timestamps } from './columns.js';
import { reserve } from './reports.js';

// Intervenants externes, assignations par lien signé (J4) et preuves de correction (J5).

/** Intervenant : électricien prestataire, sans compte. */
export const contractor = pgTable(
  'contractor',
  {
    id: id(),
    organisationId: organisationId(),
    name: text('name').notNull(),
    company: text('company'),
    email: text('email').notNull(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index().on(table.organisationId),
    unique().on(table.id, table.organisationId),
    organisationIsolation('contractor'),
  ],
);

/**
 * Assignation : des réserves confiées à un intervenant, avec une échéance. Le lien envoyé porte
 * un jeton aléatoire dont seule l'empreinte (SHA-256) est stockée.
 */
export const assignment = pgTable(
  'assignment',
  {
    id: id(),
    organisationId: organisationId(),
    contractorId: uuid('contractor_id').notNull(),
    dueDate: date('due_date', { mode: 'string' }),
    message: text('message'),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => user.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index().on(table.organisationId),
    unique().on(table.id, table.organisationId),
    foreignKey({
      columns: [table.contractorId, table.organisationId],
      foreignColumns: [contractor.id, contractor.organisationId],
    }),
    organisationIsolation('assignment'),
    // L'intervenant arrive sans session : l'API pose l'empreinte du jeton dans la transaction,
    // ce qui rend visible cette seule assignation et donne son organisation.
    pgPolicy('assignment_token_lookup', {
      for: 'select',
      using: sql`token_hash = nullif(current_setting('app.assignment_token_hash', true), '')`,
    }),
  ],
);

export const assignmentReserve = pgTable(
  'assignment_reserve',
  {
    organisationId: organisationId(),
    assignmentId: uuid('assignment_id').notNull(),
    reserveId: uuid('reserve_id').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.assignmentId, table.reserveId] }),
    index().on(table.organisationId),
    index().on(table.reserveId),
    foreignKey({
      columns: [table.assignmentId, table.organisationId],
      foreignColumns: [assignment.id, assignment.organisationId],
    }),
    foreignKey({
      columns: [table.reserveId, table.organisationId],
      foreignColumns: [reserve.id, reserve.organisationId],
    }),
    organisationIsolation('assignment_reserve'),
  ],
);

/**
 * Collaborateur (membre de l'organisation) chargé de corriger une réserve ; plusieurs par
 * réserve. Retiré par l'admin ou au retrait du membre (`removedAt`), jamais supprimé.
 */
export const reserveMember = pgTable(
  'reserve_member',
  {
    id: id(),
    organisationId: organisationId(),
    reserveId: uuid('reserve_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id),
    assignedBy: uuid('assigned_by')
      .notNull()
      .references(() => user.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    removedAt: timestamp('removed_at', { withTimezone: true }),
    removedBy: uuid('removed_by').references(() => user.id),
  },
  (table) => [
    index().on(table.organisationId),
    index().on(table.reserveId),
    index().on(table.userId),
    // Une seule assignation en cours par réserve et par collaborateur.
    uniqueIndex()
      .on(table.reserveId, table.userId)
      .where(sql`${table.removedAt} is null`),
    foreignKey({
      columns: [table.reserveId, table.organisationId],
      foreignColumns: [reserve.id, reserve.organisationId],
    }),
    organisationIsolation('reserve_member'),
  ],
);

/** Preuve de correction : photos et commentaire, par un membre ou par l'intervenant. */
export const proof = pgTable(
  'proof',
  {
    id: id(),
    organisationId: organisationId(),
    reserveId: uuid('reserve_id').notNull(),
    assignmentId: uuid('assignment_id'),
    authorUserId: uuid('author_user_id').references(() => user.id),
    authorContractorId: uuid('author_contractor_id'),
    comment: text('comment'),
    photoKeys: text('photo_keys').array().notNull().default([]),
    /** Identifiant choisi par le téléphone : un envoi rejoué après une coupure ne double rien. */
    clientId: uuid('client_id').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index().on(table.organisationId),
    index().on(table.reserveId),
    foreignKey({
      columns: [table.reserveId, table.organisationId],
      foreignColumns: [reserve.id, reserve.organisationId],
    }),
    foreignKey({
      columns: [table.assignmentId, table.organisationId],
      foreignColumns: [assignment.id, assignment.organisationId],
    }),
    foreignKey({
      columns: [table.authorContractorId, table.organisationId],
      foreignColumns: [contractor.id, contractor.organisationId],
    }),
    organisationIsolation('proof'),
  ],
);
