import { z } from 'zod';

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
