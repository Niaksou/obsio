import { z } from 'zod';
import { licenceAccessSchema, licenceSchema } from './licence.js';

// Console Obsio (équipe de l'éditeur, jamais les clients) : contrat de l'API. Que des
// métadonnées et des compteurs : aucun contenu d'un client (réserves, rapports, plans, photos).

export const consoleSessionSchema = z.object({
  /** Compte de l'équipe Obsio. Faux pour tout autre compte, qui ne voit pas la console. */
  staff: z.boolean(),
  /** Console déverrouillée par une clé d'accès, jusqu'à cette date (prolongée à l'usage). */
  unlockedUntil: z.iso.datetime().nullable(),
});
export type ConsoleSession = z.infer<typeof consoleSessionSchema>;

export const consoleAuditEntrySchema = z.object({
  id: z.uuid(),
  createdAt: z.iso.datetime(),
  actor: z.string(),
  action: z.string(),
  organisationId: z.uuid().nullable(),
  organisationName: z.string().nullable(),
  details: z.record(z.string(), z.unknown()),
});
export type ConsoleAuditEntry = z.infer<typeof consoleAuditEntrySchema>;

/** Client vu depuis la console : sa licence et des compteurs, rien de son contenu. */
export const consoleClientSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  createdAt: z.iso.datetime(),
  licence: licenceSchema,
  access: licenceAccessSchema,
  members: z.number().int(),
  pendingInvitations: z.number().int(),
  sites: z.number().int(),
  analysesThisMonth: z.number().int(),
  ocrPagesThisMonth: z.number().int(),
  /** Dernière ouverture de session d'un membre, null si personne ne s'est encore connecté. */
  lastLoginAt: z.iso.datetime().nullable(),
});
export type ConsoleClient = z.infer<typeof consoleClientSchema>;

/** Ouverture d'un client depuis la console : comme pnpm org:create, avec sa licence. */
export const consoleClientCreateSchema = z.object({
  name: z.string().trim().min(1, 'Nom requis').max(200),
  adminEmail: z.email('Adresse e-mail invalide').trim().toLowerCase(),
  licence: licenceSchema,
});
export type ConsoleClientCreate = z.infer<typeof consoleClientCreateSchema>;
