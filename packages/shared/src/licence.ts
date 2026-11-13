import { z } from 'zod';

// Licence d'un client : une par organisation, gérée par l'équipe Obsio dans la console.
// Une licence suspendue, révoquée ou échue laisse le client en lecture seule, export compris :
// ses données restent consultables, rien de nouveau ne s'y ajoute.

export const LICENCE_PLANS = ['essai', 'standard', 'sur_mesure'] as const;
export const licencePlanSchema = z.enum(LICENCE_PLANS);
export type LicencePlan = z.infer<typeof licencePlanSchema>;

export const LICENCE_PLAN_LABELS: Record<LicencePlan, string> = {
  essai: 'Essai',
  standard: 'Standard',
  sur_mesure: 'Sur mesure',
};

export const LICENCE_STATUSES = ['active', 'suspendue', 'revoquee'] as const;
export const licenceStatusSchema = z.enum(LICENCE_STATUSES);
export type LicenceStatus = z.infer<typeof licenceStatusSchema>;

/** Plafond facultatif : null pour « sans limite ». */
const cap = z.number().int().min(0).max(100_000).nullable();

const licenceFields = z.object({
  plan: licencePlanSchema,
  status: licenceStatusSchema,
  /** Dates du calendrier (AAAA-MM-JJ), heure de Paris. La licence vaut jusqu'à endsOn inclus. */
  startsOn: z.iso.date(),
  endsOn: z.iso.date().nullable(),
  maxSites: cap,
  maxMembers: cap,
  maxAnalysesPerMonth: cap,
  note: z.string().trim().max(1000).nullable(),
});

export const licenceSchema = licenceFields.refine(
  (licence) => !licence.endsOn || licence.endsOn >= licence.startsOn,
  { message: 'La fin de la licence précède son début', path: ['endsOn'] },
);
export type Licence = z.infer<typeof licenceSchema>;

/** Licence des clients ouverts sans licence explicite : standard, sans échéance ni plafond. */
export function defaultLicence(today: string): Licence {
  return {
    plan: 'standard',
    status: 'active',
    startsOn: today,
    endsOn: null,
    maxSites: null,
    maxMembers: null,
    maxAnalysesPerMonth: null,
    note: null,
  };
}

export const READ_ONLY_REASONS = ['suspendue', 'revoquee', 'expiree'] as const;
export type ReadOnlyReason = (typeof READ_ONLY_REASONS)[number];

/** Date du jour (AAAA-MM-JJ) à Paris : les échéances suivent le calendrier du client. */
export function parisDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(now);
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

export const licenceAccessSchema = z.object({
  plan: licencePlanSchema,
  /** complet : utilisation normale ; lecture : consultation et export seulement. */
  access: z.enum(['complet', 'lecture']),
  reason: z.enum(READ_ONLY_REASONS).nullable(),
  endsOn: z.iso.date().nullable(),
  /** Jours restants jusqu'à endsOn inclus (0 le dernier jour), null sans échéance. */
  daysLeft: z.number().int().nullable(),
});
export type LicenceAccess = z.infer<typeof licenceAccessSchema>;

/** Ce que la licence permet aujourd'hui. */
export function licenceAccess(licence: Licence, today: string = parisDate()): LicenceAccess {
  const daysLeft = licence.endsOn ? daysBetween(today, licence.endsOn) : null;
  const reason: ReadOnlyReason | null =
    licence.status === 'revoquee'
      ? 'revoquee'
      : licence.status === 'suspendue'
        ? 'suspendue'
        : daysLeft !== null && daysLeft < 0
          ? 'expiree'
          : null;
  return {
    plan: licence.plan,
    access: reason ? 'lecture' : 'complet',
    reason,
    endsOn: licence.endsOn,
    daysLeft,
  };
}

/** Message affiché aux utilisateurs d'un client en lecture seule. */
export const READ_ONLY_MESSAGES: Record<ReadOnlyReason, string> = {
  suspendue: 'Licence suspendue : vos données restent consultables et exportables.',
  revoquee: 'Licence révoquée : vos données restent consultables et exportables.',
  expiree: 'Licence échue : vos données restent consultables et exportables.',
};
