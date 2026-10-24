import { index, pgTable, text } from 'drizzle-orm/pg-core';
import { id, organisationId, organisationIsolation, timestamps } from './columns.js';

export const site = pgTable(
  'site',
  {
    id: id(),
    organisationId: organisationId(),
    name: text('name').notNull(),
    address: text('address'),
    ...timestamps,
  },
  (table) => [index().on(table.organisationId), organisationIsolation('site')],
);
