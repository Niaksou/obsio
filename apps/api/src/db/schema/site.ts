import { index, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { id, organisationId, organisationIsolation, timestamps } from './columns.js';

export const site = pgTable(
  'site',
  {
    id: id(),
    organisationId: organisationId(),
    name: text('name').notNull(),
    address: text('address'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index().on(table.organisationId),
    unique().on(table.id, table.organisationId),
    organisationIsolation('site'),
  ],
);
