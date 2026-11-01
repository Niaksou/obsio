import { INSPECTION_STATUS_LABELS, type Inspection, type InspectionStatus } from '@obsio/shared';
import { formatDay } from '../reserves/status.js';

/** État d'une vérification : pastille et libellé, sur le modèle des statuts de réserve. */
export function InspectionStatusLabel({ status }: { status: InspectionStatus }) {
  return (
    <span className={`inspection-status inspection-status-${status}`}>
      <span className="swatch" aria-hidden="true" />
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
