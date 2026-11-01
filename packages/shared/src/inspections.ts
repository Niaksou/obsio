import { z } from 'zod';

// Échéancier des vérifications (après J6) : quand l'organisme de contrôle doit revenir sur un
// site, pour chaque type de vérification suivi.

export const INSPECTION_KINDS = ['periodique', 'q18', 'q19'] as const;
export const inspectionKindSchema = z.enum(INSPECTION_KINDS);
export type InspectionKind = z.infer<typeof inspectionKindSchema>;

export const INSPECTION_KIND_LABELS: Record<InspectionKind, string> = {
  periodique: 'Vérification périodique (Code du travail)',
  q18: 'Vérification Q18 (assureur)',
  q19: 'Thermographie Q19 (assureur)',
};

/** Périodicité proposée tant que l'admin ne l'a pas changée : annuelle pour les trois. */
export const DEFAULT_PERIODICITY_MONTHS = 12;
/** Une échéance à moins de ce nombre de jours, sans visite programmée, est « à programmer ». */
export const INSPECTION_NOTICE_DAYS = 60;

export const INSPECTION_STATUSES = [
  'a_jour',
  'a_programmer',
  'programmee',
  'rapport_attendu',
  'en_retard',
  'inconnue',
  'desactivee',
] as const;
export type InspectionStatus = (typeof INSPECTION_STATUSES)[number];

export const INSPECTION_STATUS_LABELS: Record<InspectionStatus, string> = {
  a_jour: 'À jour',
  a_programmer: 'À programmer',
  programmee: 'Programmée',
  rapport_attendu: 'Rapport à importer',
  en_retard: 'En retard',
  inconnue: 'Aucun rapport',
  desactivee: 'Non suivie',
};

export const inspectionSchema = z.object({
  siteId: z.uuid(),
  siteName: z.string(),
  kind: inspectionKindSchema,
  enabled: z.boolean(),
  periodicityMonths: z.int(),
  /** Dernière visite d'après les rapports validés du site (la vérification initiale compte). */
  lastVisit: z.object({ date: z.iso.date(), organisme: z.string(), importId: z.uuid() }).nullable(),
  /** Dernière visite + périodicité ; null sans rapport. */
  dueDate: z.iso.date().nullable(),
  /** Visite convenue avec l'organisme, tant qu'aucun rapport plus récent ne l'a remplacée. */
  plannedDate: z.iso.date().nullable(),
  contact: z.string().nullable(),
  status: z.enum(INSPECTION_STATUSES),
});
export type Inspection = z.infer<typeof inspectionSchema>;

export const updateInspectionSchema = z.object({
  enabled: z.boolean(),
  periodicityMonths: z.int().min(1).max(60),
  plannedDate: z.iso.date().nullable(),
  contact: z.string().trim().max(500).nullable(),
});
export type UpdateInspection = z.infer<typeof updateInspectionSchema>;

/** Ajoute des mois à une date ISO ; un 31 devient le dernier jour du mois s'il n'existe pas. */
export function addMonths(day: string, months: number): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

/** Nombre de jours de `from` à `to` (négatif si `to` est passé). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Échéance et état d'une vérification, à la date `on` (jour à Paris). */
export function inspectionState(
  input: {
    enabled: boolean;
    periodicityMonths: number;
    lastVisitDate: string | null;
    plannedDate: string | null;
  },
  on: string,
): Pick<Inspection, 'dueDate' | 'plannedDate' | 'status'> {
  const dueDate = input.lastVisitDate
    ? addMonths(input.lastVisitDate, input.periodicityMonths)
    : null;
  // Une visite programmée est remplacée par le rapport qu'elle produit.
  const plannedDate =
    input.plannedDate && (!input.lastVisitDate || input.plannedDate > input.lastVisitDate)
      ? input.plannedDate
      : null;
  const status: InspectionStatus = !input.enabled
    ? 'desactivee'
    : plannedDate && plannedDate >= on
      ? 'programmee'
      : plannedDate
        ? 'rapport_attendu'
        : !dueDate
          ? 'inconnue'
          : dueDate < on
            ? 'en_retard'
            : daysBetween(on, dueDate) <= INSPECTION_NOTICE_DAYS
              ? 'a_programmer'
              : 'a_jour';
  return { dueDate, plannedDate, status };
}
