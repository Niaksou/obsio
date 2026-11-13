import { date, integer, pgTable, text, unique } from 'drizzle-orm/pg-core';
import { id, organisationId, organisationIsolation } from './columns.js';

/**
 * Pages vues d'un client, par jour et modèle de page (« /etages/:id »). Ni utilisateur ni
 * adresse : seulement un compteur, lu par la console Obsio.
 */
export const pageView = pgTable(
  'page_view',
  {
    id: id(),
    organisationId: organisationId(),
    day: date('day', { mode: 'string' }).notNull(),
    path: text('path').notNull(),
    views: integer('views').notNull().default(0),
  },
  (table) => [
    unique().on(table.organisationId, table.day, table.path),
    organisationIsolation('page_view'),
  ],
);
