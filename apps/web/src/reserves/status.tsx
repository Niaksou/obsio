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

/** Statut d'une réserve : pastille de couleur et libellé, avec le retard s'il y en a. */
export function StatusLabel({ status, overdue }: { status: ReserveStatus; overdue?: boolean }) {
  return (
    <span className={`reserve-status reserve-status-${status}${overdue ? ' overdue' : ''}`}>
      <span className="swatch" aria-hidden="true" />
      <span>
        {RESERVE_STATUS_LABELS[status]}
        {overdue && <span className="late">, en retard</span>}
      </span>
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
