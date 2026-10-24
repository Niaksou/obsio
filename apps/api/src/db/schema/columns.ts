import { sql } from 'drizzle-orm';
import { pgPolicy, timestamp, uuid } from 'drizzle-orm/pg-core';
import { organisation } from './organisation.js';

export const id = () => uuid('id').primaryKey().defaultRandom();

export const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/** Colonne de cloisonnement, obligatoire sur chaque table métier. */
export const organisationId = () =>
  uuid('organisation_id')
    .notNull()
    .references(() => organisation.id);

/**
 * Politique RLS de cloisonnement : une ligne n'est visible et modifiable que si elle appartient
 * à l'organisation posée en début de transaction (voir withOrganisation).
 */
export const organisationIsolation = (table: string) =>
  pgPolicy(`${table}_organisation_isolation`, {
    for: 'all',
    using: sql`organisation_id = app_current_organisation_id()`,
    withCheck: sql`organisation_id = app_current_organisation_id()`,
  });
