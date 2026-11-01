import type { ReserveListItem } from '@obsio/shared';
import type { ReserveBadge } from '../plan/PlanViewer.js';

const URGENCY: ReserveBadge['status'][] = ['ouverte', 'assignee', 'corrigee'];

/** Une pastille par équipement : réserves non levées, statut le plus urgent, retard éventuel. */
export function reserveBadges(reserves: ReserveListItem[]) {
  const badges = new Map<string, ReserveBadge>();
  for (const item of reserves) {
    if (!item.equipment || item.status === 'levee') continue;
    const current = badges.get(item.equipment.id);
    const status =
      current && URGENCY.indexOf(current.status) < URGENCY.indexOf(item.status)
        ? current.status
        : item.status;
    badges.set(item.equipment.id, {
      count: (current?.count ?? 0) + 1,
      status,
      overdue: (current?.overdue ?? false) || item.overdue,
    });
  }
  return badges;
}
