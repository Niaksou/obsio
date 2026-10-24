import { EQUIPMENT_TYPES } from '@obsio/shared';
import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { id, organisationId, organisationIsolation, timestamps } from './columns.js';
import { site } from './site.js';

// Hiérarchie du terrain : site → bâtiment → étage → équipement.
// Chaque lien vers le parent passe par (id, organisation_id) : une clé étrangère contourne la RLS,
// la paire empêche de rattacher une ligne au parent d'une autre organisation.

/** Archivage à la place de la suppression : les équipements porteront des réserves. */
const archivedAt = () => timestamp('archived_at', { withTimezone: true });

export const building = pgTable(
  'building',
  {
    id: id(),
    organisationId: organisationId(),
    siteId: uuid('site_id').notNull(),
    name: text('name').notNull(),
    archivedAt: archivedAt(),
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
    organisationIsolation('building'),
  ],
);

export const floor = pgTable(
  'floor',
  {
    id: id(),
    organisationId: organisationId(),
    buildingId: uuid('building_id').notNull(),
    name: text('name').notNull(),
    /** Niveau (0 = rez-de-chaussée, -1 = sous-sol) : ordre d'affichage et future vue 3D. */
    level: integer('level').notNull().default(0),
    /** Fichier déposé (PDF ou image) et image affichée sur le plan, dans le stockage objet. */
    planSourceKey: text('plan_source_key'),
    planImageKey: text('plan_image_key'),
    planWidth: integer('plan_width'),
    planHeight: integer('plan_height'),
    /** Mètres par pixel de l'image du plan, une fois l'échelle calibrée (plus tard). */
    scale: real('scale'),
    archivedAt: archivedAt(),
    ...timestamps,
  },
  (table) => [
    index().on(table.organisationId),
    index().on(table.buildingId),
    unique().on(table.id, table.organisationId),
    foreignKey({
      columns: [table.buildingId, table.organisationId],
      foreignColumns: [building.id, building.organisationId],
    }),
    organisationIsolation('floor'),
  ],
);

export const equipmentType = pgEnum('equipment_type', EQUIPMENT_TYPES);

export const equipment = pgTable(
  'equipment',
  {
    id: id(),
    organisationId: organisationId(),
    floorId: uuid('floor_id').notNull(),
    type: equipmentType('type').notNull(),
    /** Repère (« TD2 ») ou nom de la machine dans l'entreprise (« Presse 3 »). */
    name: text('name').notNull(),
    /** Autres appellations, utilisées pour rapprocher les réserves (« tableau atelier »). */
    aliases: text('aliases').array().notNull().default([]),
    /** Position sur le plan, en proportion de la largeur et de la hauteur de l'image (0 à 1). */
    x: real('x'),
    y: real('y'),
    archivedAt: archivedAt(),
    ...timestamps,
  },
  (table) => [
    index().on(table.organisationId),
    index().on(table.floorId),
    foreignKey({
      columns: [table.floorId, table.organisationId],
      foreignColumns: [floor.id, floor.organisationId],
    }),
    check(
      'equipment_position',
      // Les deux coordonnées ou aucune : un CHECK laisse passer un résultat NULL, d'où les « is not null ».
      sql`(${table.x} is null and ${table.y} is null) or (${table.x} is not null and ${table.y} is not null and ${table.x} between 0 and 1 and ${table.y} between 0 and 1)`,
    ),
    organisationIsolation('equipment'),
  ],
);
