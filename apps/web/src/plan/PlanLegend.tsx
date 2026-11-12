import { RESERVE_STATUS_LABELS } from '@obsio/shared';
import type { ReserveBadge } from './PlanViewer.js';

const ORDER: ReserveBadge['status'][] = ['ouverte', 'assignee', 'corrigee'];

/** Légende des pastilles, limitée aux statuts présents sur l'étage. */
export function PlanLegend({ badges }: { badges: Map<string, ReserveBadge> }) {
  const values = [...badges.values()];
  const statuses = ORDER.filter((status) => values.some((badge) => badge.status === status));
  const late = values.some((badge) => badge.overdue);
  return (
    <ul className="plan-legend" aria-label="Légende des pastilles">
      {statuses.map((status) => (
        <li key={status}>
          <span className={`legend-dot legend-${status}`} aria-hidden />
          {RESERVE_STATUS_LABELS[status]}
        </li>
      ))}
      {late && (
        <li>
          <span className="legend-dot legend-late" aria-hidden />
          En retard
        </li>
      )}
    </ul>
  );
}
