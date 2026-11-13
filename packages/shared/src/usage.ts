import { z } from 'zod';

// Données d'usage pour la console Obsio. Pages vues : comptées par organisation, jour et modèle
// de page (identifiants remplacés par « :id »), sans utilisateur, sans cookie de mesure, et
// seulement pour les pages connues : le nombre de lignes reste borné.

export const PAGE_PATTERNS = [
  '/',
  '/sites/:id',
  '/sites/:id/reserves',
  '/reserves/:id',
  '/etages/:id',
  '/batiments/:id/3d',
  '/imports/:id',
  '/mes-reserves',
  '/verifications',
  '/organisation',
  '/compte',
] as const;
export type PagePattern = (typeof PAGE_PATTERNS)[number];

export const PAGE_LABELS: Record<PagePattern, string> = {
  '/': 'Sites',
  '/sites/:id': 'Site',
  '/sites/:id/reserves': 'Réserves d’un site',
  '/reserves/:id': 'Réserve',
  '/etages/:id': 'Plan d’un étage',
  '/batiments/:id/3d': 'Vue 3D',
  '/imports/:id': 'Validation d’un rapport',
  '/mes-reserves': 'Mes réserves',
  '/verifications': 'Échéances de contrôle',
  '/organisation': 'Organisation',
  '/compte': 'Mon compte',
};

const UUID_SEGMENT = /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?=\/|$)/gi;

/** Modèle de la page affichée, ou null si elle n'est pas comptée (console, pages publiques). */
export function pagePattern(pathname: string): PagePattern | null {
  const pattern = pathname.replace(UUID_SEGMENT, '/:id').replace(/(.)\/$/, '$1');
  return (PAGE_PATTERNS as readonly string[]).includes(pattern) ? (pattern as PagePattern) : null;
}

export const pageViewInputSchema = z.object({ path: z.enum(PAGE_PATTERNS) });

const consumption = {
  analyses: z.number().int(),
  failures: z.number().int(),
  ocrPages: z.number().int(),
  promptTokens: z.number().int(),
  completionTokens: z.number().int(),
  /** Coût estimé en euros, d'après les tarifs réglés sur l'API. */
  cost: z.number(),
};

export const consoleUsageSchema = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
  prices: z.object({
    ocrPer1000Pages: z.number(),
    inputPerMillionTokens: z.number(),
    outputPerMillionTokens: z.number(),
  }),
  /** Un point par jour de la période, jours sans analyse compris. */
  days: z.array(z.object({ day: z.iso.date(), pageViews: z.number().int(), ...consumption })),
  clients: z.array(
    z.object({ id: z.uuid(), name: z.string(), pageViews: z.number().int(), ...consumption }),
  ),
  /** Brouillons extraits déjà tranchés, par modèle et version du prompt. */
  quality: z.array(
    z.object({
      model: z.string(),
      promptVersion: z.string(),
      kept: z.number().int(),
      edited: z.number().int(),
      rejected: z.number().int(),
    }),
  ),
  pages: z.array(z.object({ path: z.enum(PAGE_PATTERNS), views: z.number().int() })),
});
export type ConsoleUsage = z.infer<typeof consoleUsageSchema>;
