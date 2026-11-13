import { LICENCE_PLANS, LICENCE_STATUSES } from '@obsio/shared';
import { sql } from 'drizzle-orm';
import { check, date, integer, pgEnum, pgTable, text } from 'drizzle-orm/pg-core';
import { id, organisationId, organisationIsolation, timestamps } from './columns.js';

export const licencePlan = pgEnum('licence_plan', LICENCE_PLANS);
export const licenceStatus = pgEnum('licence_status', LICENCE_STATUSES);

/**
 * Licence d'un client, une par organisation, écrite depuis la console Obsio. Sans ligne, le
 * client a la licence par défaut (standard, sans échéance ni plafond). L'historique des
 * changements est dans console_audit.
 */
export const licence = pgTable(
  'licence',
  {
    id: id(),
    organisationId: organisationId().unique(),
    plan: licencePlan('plan').notNull(),
    status: licenceStatus('status').notNull().default('active'),
    startsOn: date('starts_on', { mode: 'string' }).notNull(),
    endsOn: date('ends_on', { mode: 'string' }),
    maxSites: integer('max_sites'),
    maxMembers: integer('max_members'),
    maxAnalysesPerMonth: integer('max_analyses_per_month'),
    note: text('note'),
    ...timestamps,
  },
  (table) => [
    check('licence_dates', sql`${table.endsOn} is null or ${table.endsOn} >= ${table.startsOn}`),
    check(
      'licence_caps',
      sql`coalesce(${table.maxSites}, 0) >= 0 and coalesce(${table.maxMembers}, 0) >= 0 and coalesce(${table.maxAnalysesPerMonth}, 0) >= 0`,
    ),
    organisationIsolation('licence'),
  ],
);
