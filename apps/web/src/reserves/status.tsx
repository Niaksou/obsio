import { RESERVE_STATUS_LABELS, type ReserveListItem, type ReserveStatus } from '@obsio/shared';

/** « 2026-06-30 » → « 30 juin 2026 », sans décalage de fuseau. */
export function formatDay(day: string) {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year!, month! - 1, date!).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Statut d'une réserve en plaque gravée, suivi d'une plaque « en retard » s'il y a lieu. */
export function StatusLabel({ status, overdue }: { status: ReserveStatus; overdue?: boolean }) {
  return (
    <span className={`reserve-status reserve-status-${status}`}>
      <span className="status-plate">{RESERVE_STATUS_LABELS[status]}</span>
      {overdue && (
        <span className="status-plate status-plate-late">
          <span className="visually-hidden">, </span>en retard
        </span>
      )}
    </span>
  );
}

export function equipmentLabel(item: Pick<ReserveListItem, 'equipment'>) {
  if (!item.equipment) return 'Équipement non rattaché';
  return `${item.equipment.name}, ${item.equipment.buildingName} ${item.equipment.floorName}`;
}

export function plural(n: number, word: string) {
  return `${n} ${word}${n > 1 ? 's' : ''}`;
}
