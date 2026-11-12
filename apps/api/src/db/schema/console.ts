import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { user } from './auth.js';

// Console Obsio : réservée à l'équipe de l'éditeur, jamais aux clients. Tables globales (pas
// d'organisation_id) : elles ne contiennent aucune donnée d'un client, seulement qui fait partie
// de l'équipe et ce qu'elle a fait.

/** Comptes de l'équipe Obsio. Attribué seulement en ligne de commande (pnpm staff:grant). */
export const staffMember = pgTable('staff_member', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Journal des actions faites dans la console (création de client, licence…). En ajout seul :
 * l'application n'a ni UPDATE ni DELETE dessus (migration). L'organisation visée est gardée
 * sans clé étrangère, pour que le journal survive à la suppression d'un client (RGPD).
 */
export const consoleAudit = pgTable(
  'console_audit',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => user.id),
    action: text('action').notNull(),
    targetOrganisationId: uuid('target_organisation_id'),
    details: jsonb('details').$type<Record<string, unknown>>().notNull().default({}),
  },
  (table) => [index().on(table.createdAt), index().on(table.targetOrganisationId)],
);
