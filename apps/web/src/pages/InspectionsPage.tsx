import { INSPECTION_KIND_LABELS, INSPECTION_STATUS_LABELS } from '@obsio/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api.js';
import { lastVisitLabel, nextStep, STATUS_ORDER } from '../inspections/describe.js';
import { keys } from '../queries.js';

/** Échéancier de toute l'organisation, regroupé par état, les plus urgentes d'abord. */
export function InspectionsPage() {
  const [showDisabled, setShowDisabled] = useState(false);
  const inspections = useQuery({ queryKey: keys.inspections, queryFn: api.inspections });

  if (inspections.error) return <p className="error">{inspections.error.message}</p>;
  if (!inspections.data) return <p className="loading">Chargement…</p>;
  const disabled = inspections.data.filter((i) => i.status === 'desactivee').length;
  const groups = STATUS_ORDER.filter((status) => showDisabled || status !== 'desactivee')
    .map((status) => ({
      status,
      items: inspections.data.filter((i) => i.status === status),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <div className="page">
      <h1>Vérifications</h1>
      <p className="hint">
        Prochaines visites des organismes de contrôle sur vos sites : vérification périodique du
        Code du travail et vérifications demandées par l’assureur.
      </p>
      {groups.length === 0 && (
        <p className="empty">Créez un site et importez ses rapports pour suivre les échéances.</p>
      )}
      {groups.map(({ status, items }) => (
        <section key={status} className="inspection-group">
          <h2>
            {INSPECTION_STATUS_LABELS[status]} <span className="count">{items.length}</span>
          </h2>
          <ul className="rows">
            {items.map((inspection) => {
              const last = lastVisitLabel(inspection);
              return (
                <li key={`${inspection.siteId}-${inspection.kind}`}>
                  <Link to={`/sites/${inspection.siteId}#verifications`} className="row-link">
                    <span className="row-title">{inspection.siteName}</span>
                    <span>{INSPECTION_KIND_LABELS[inspection.kind]}</span>
                    <span className="inspection-next">{nextStep(inspection)}</span>
                    {last && <span className="row-meta">{last}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {disabled > 0 && (
        <p>
          <button
            type="button"
            className="secondary"
            onClick={() => setShowDisabled(!showDisabled)}
          >
            {showDisabled
              ? 'Masquer les vérifications non suivies'
              : `Afficher les vérifications non suivies (${disabled})`}
          </button>
        </p>
      )}
    </div>
  );
}
