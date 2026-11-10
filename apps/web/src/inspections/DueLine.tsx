import type { Inspection } from '@obsio/shared';
import type { ReactNode } from 'react';
import { dateParts, InspectionStatusLabel, keyDate, nextStep, relativeDay } from './describe.js';

/**
 * Contenu d'une ligne d'échéance : la date en colonne, un titre avec sa précision, l'état et
 * le délai à droite. Partagé par la page des échéances et la section d'un site.
 */
export function DueLine({
  inspection,
  title,
  detail,
}: {
  inspection: Inspection;
  title: ReactNode;
  /** Précision sous le titre ; par défaut, ce que représente la date. */
  detail?: ReactNode;
}) {
  const key = keyDate(inspection);
  const parts = key && dateParts(key.date);
  return (
    <>
      <span className="due-date">
        {parts ? (
          <>
            <strong>{parts.dayMonth}</strong>
            <small>{parts.year}</small>
          </>
        ) : (
          '—'
        )}
      </span>
      <span className="due-main">
        <span className="row-title">{title}</span>
        <small>{detail ?? key?.label ?? nextStep(inspection)}</small>
      </span>
      <span className="due-side">
        <InspectionStatusLabel status={inspection.status} />
        {key && <small>{relativeDay(key.date)}</small>}
      </span>
    </>
  );
}
