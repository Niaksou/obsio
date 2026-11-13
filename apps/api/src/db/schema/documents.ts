import { sql } from 'drizzle-orm';
import {
  foreignKey,
  index,
  integer,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { user } from './auth.js';
import { organisationId, organisationIsolation } from './columns.js';
import { site } from './site.js';

/**
 * Document émis (dossier de preuves en PDF) : son empreinte SHA-256 est enregistrée à
 * l'émission et le fichier gardé tel quel dans le stockage. Ni modifié ni supprimé par
 * l'application (droits retirés à app_user dans la migration) : la page publique « Vérifier un
 * document » compare l'empreinte d'un fichier déposé à ce registre.
 */
export const issuedDocument = pgTable(
  'issued_document',
  {
    // Identifiant tiré avant la génération : il figure dans le QR code du document.
    id: uuid('id').primaryKey(),
    organisationId: organisationId(),
    kind: text('kind', { enum: ['dossier_preuves'] }).notNull(),
    siteId: uuid('site_id').notNull(),
    documentType: text('document_type'),
    scope: text('scope', { enum: ['levees', 'toutes'] }).notNull(),
    reserveCount: integer('reserve_count').notNull(),
    liftedCount: integer('lifted_count').notNull(),
    sha256: text('sha256').notNull().unique(),
    byteSize: integer('byte_size').notNull(),
    storageKey: text('storage_key').notNull(),
    // Empreinte SHA-256 du certificat qui a signé le PDF.
    signerFingerprint: text('signer_fingerprint').notNull(),
    issuedBy: uuid('issued_by')
      .notNull()
      .references(() => user.id),
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index().on(table.organisationId),
    index().on(table.siteId),
    foreignKey({
      columns: [table.siteId, table.organisationId],
      foreignColumns: [site.id, site.organisationId],
    }),
    organisationIsolation('issued_document'),
    // Vérification publique, sans session : l'API pose l'empreinte du fichier déposé dans la
    // transaction, ce qui rend visible ce seul document.
    // QR code du document : l'API pose son identifiant (UUID tiré au hasard, impossible à
    // deviner), ce qui rend visible ce seul document pour en afficher la fiche publique.
    pgPolicy('issued_document_id_lookup', {
      for: 'select',
      using: sql`id = nullif(current_setting('app.document_id', true), '')::uuid`,
    }),
    pgPolicy('issued_document_sha256_lookup', {
      for: 'select',
      using: sql`sha256 = nullif(current_setting('app.document_sha256', true), '')`,
    }),
  ],
);
