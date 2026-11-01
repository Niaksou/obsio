import { INSPECTION_KINDS } from '@obsio/shared';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { id, organisationId, organisationIsolation, timestamps } from './columns.js';
import { site } from './site.js';

// Échéancier des vérifications : réglages d'un type de vérification sur un site. Sans ligne,
// les valeurs par défaut s'appliquent (suivie, annuelle) ; la dernière visite vient des rapports.

export const inspectionKind = pgEnum('inspection_kind', INSPECTION_KINDS);

export const inspectionPlan = pgTable(
  'inspection_plan',
  {
    id: id(),
    organisationId: organisationId(),
    siteId: uuid('site_id').notNull(),
    kind: inspectionKind('kind').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    periodicityMonths: integer('periodicity_months').notNull(),
    plannedDate: date('planned_date', { mode: 'string' }),
    /** Organisme et interlocuteur, en texte libre (nom, téléphone, e-mail). */
    contact: text('contact'),
    ...timestamps,
  },
  (table) => [
    index().on(table.organisationId),
    unique().on(table.siteId, table.kind),
    foreignKey({
      columns: [table.siteId, table.organisationId],
      foreignColumns: [site.id, site.organisationId],
    }),
    check('inspection_plan_periodicity', sql`${table.periodicityMonths} between 1 and 60`),
    organisationIsolation('inspection_plan'),
  ],
);
