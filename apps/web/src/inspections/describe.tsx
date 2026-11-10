import { INSPECTION_STATUS_LABELS, type Inspection, type InspectionStatus } from '@obsio/shared';
import { formatDay } from '../reserves/status.js';

/** État d'une vérification en plaque gravée, sur le modèle des statuts de réserve. */
export function InspectionStatusLabel({ status }: { status: InspectionStatus }) {
  return (
    <span className={`status-plate inspection-status inspection-status-${status}`}>
      {INSPECTION_STATUS_LABELS[status]}
    </span>
  );
}

/** Ce qu'il faut savoir de l'échéance, en une phrase. */
export function nextStep(inspection: Inspection): string {
  const { status, dueDate, plannedDate } = inspection;
  switch (status) {
    case 'programmee':
      return `Visite programmée le ${formatDay(plannedDate!)}`;
    case 'rapport_attendu':
      return `Visite du ${formatDay(plannedDate!)} : rapport pas encore importé`;
    case 'en_retard':
      return `Échéance dépassée depuis le ${formatDay(dueDate!)}`;
    case 'a_programmer':
    case 'a_jour':
      return `Prochaine visite avant le ${formatDay(dueDate!)}`;
    case 'inconnue':
      return 'Importez un rapport pour calculer l’échéance';
    case 'desactivee':
      return 'Non suivie sur ce site';
  }
}

export function lastVisitLabel(inspection: Inspection): string | null {
  const visit = inspection.lastVisit;
  return visit ? `Dernière visite le ${formatDay(visit.date)}, ${visit.organisme}` : null;
}

/** Les plus urgentes d'abord. */
export const STATUS_ORDER: InspectionStatus[] = [
  'en_retard',
  'rapport_attendu',
  'a_programmer',
  'programmee',
  'a_jour',
  'inconnue',
  'desactivee',
];

/** Type de vérification en quelques mots, pour les listes. */
export const KIND_SHORT: Record<Inspection['kind'], string> = {
  periodique: 'Code du travail',
  q18: 'Q18 assureur',
  q19: 'Q19 thermographie',
};

/** Date qui compte pour l'échéancier, et ce qu'elle représente. */
export function keyDate(inspection: Inspection): { date: string; label: string } | null {
  const { status, dueDate, plannedDate } = inspection;
  switch (status) {
    case 'programmee':
      return plannedDate ? { date: plannedDate, label: 'Visite programmée' } : null;
    case 'rapport_attendu':
      return plannedDate ? { date: plannedDate, label: 'Visite faite, rapport à importer' } : null;
    case 'en_retard':
      return dueDate ? { date: dueDate, label: 'Échéance dépassée' } : null;
    case 'a_programmer':
    case 'a_jour':
      return dueDate ? { date: dueDate, label: 'Visite à faire avant' } : null;
    default:
      return null;
  }
}

const DAY_MS = 86_400_000;

function utcDay(day: string) {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
}

/** « aujourd'hui », « dans 13 j », « il y a 5 j » ; au-delà de 60 jours, en mois. */
export function relativeDay(day: string, today: Date = new Date()): string {
  const days = Math.round(
    (utcDay(day) - Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())) / DAY_MS,
  );
  if (days === 0) return 'aujourd’hui';
  const size = Math.abs(days);
  const amount = size > 60 ? `${Math.round(size / 30.4)} mois` : `${size} j`;
  return days > 0 ? `dans ${amount}` : `il y a ${amount}`;
}

/** Jour et mois courts (« 23 nov. ») et année, pour la colonne date. */
export function dateParts(day: string): { dayMonth: string; year: string } {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const dayMonth = new Date(y, m - 1, d).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
  });
  return { dayMonth, year: String(y) };
}

/** À traiter : en retard, rapport à importer, à programmer. */
export const TO_HANDLE: InspectionStatus[] = ['en_retard', 'rapport_attendu', 'a_programmer'];
/** Planifiées : visite convenue ou échéance lointaine. */
export const PLANNED: InspectionStatus[] = ['programmee', 'a_jour'];
