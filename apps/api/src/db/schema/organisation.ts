import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// Table gérée par le plugin « organization » de Better Auth (noms des champs imposés).
export const organisation = pgTable('organisation', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  logo: text('logo'),
  metadata: jsonb('metadata'),
  siret: text('siret'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
