import type { Inspection } from '@obsio/shared';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api } from '../api.js';
import { keyDate, KIND_SHORT, PLANNED, TO_HANDLE } from '../inspections/describe.js';
import { DueLine } from '../inspections/DueLine.js';
import { keys } from '../queries.js';

/**
 * Échéances de contrôle de toute l'organisation : ce qui est à traiter, puis ce qui est planifié, par
 * date. Les vérifications sans rapport ou non suivies sont repliées.
 */
export function InspectionsPage() {
  const inspections = useQuery({ queryKey: keys.inspections, queryFn: api.inspections });

  if (inspections.error) return <p className="error">{inspections.error.message}</p>;
  if (!inspections.data) return <p className="loading">Chargement…</p>;
  const all = inspections.data;
  const byDate = (a: Inspection, b: Inspection) =>
    (keyDate(a)?.date ?? '').localeCompare(keyDate(b)?.date ?? '');
  const toHandle = all.filter((i) => TO_HANDLE.includes(i.status)).sort(byDate);
  const planned = all.filter((i) => PLANNED.includes(i.status)).sort(byDate);
  const unknown = all.filter((i) => i.status === 'inconnue');
  const disabled = all.filter((i) => i.status === 'desactivee');

  return (
    <div className="page">
      <h1>Échéances de contrôle</h1>
      {all.length === 0 ? (
        <p className="empty">Créez un site et importez ses rapports pour suivre les échéances.</p>
      ) : (
        <>
          <section className="due-group" data-tour="due-to-handle">
            <h2>
              À traiter <span className="count">{toHandle.length}</span>
            </h2>
            {toHandle.length === 0 ? (
              <p className="hint">Rien à traiter pour le moment.</p>
            ) : (
              <DueRows items={toHandle} />
            )}
          </section>
          {planned.length > 0 && (
            <section className="due-group">
              <h2>
                Planifiées <span className="count">{planned.length}</span>
              </h2>
              <DueRows items={planned} />
            </section>
          )}
          {unknown.length > 0 && (
            <details className="due-more" data-tour="due-unknown">
              <summary>
                Sans rapport <span className="count">{unknown.length}</span>
              </summary>
              <p className="hint">Importez un rapport du site pour connaître l’échéance.</p>
              <PlainRows items={unknown} />
            </details>
          )}
          {disabled.length > 0 && (
            <details className="due-more">
              <summary>
                Non suivies <span className="count">{disabled.length}</span>
              </summary>
              <PlainRows items={disabled} />
            </details>
          )}
        </>
      )}
    </div>
  );
}

const link = (inspection: Inspection) => `/sites/${inspection.siteId}#verifications`;

function DueRows({ items }: { items: Inspection[] }) {
  return (
    <ul className="rows due-rows">
      {items.map((inspection) => {
        const key = keyDate(inspection);
        return (
          <li key={`${inspection.siteId}-${inspection.kind}`}>
            <Link to={link(inspection)} className="due-row">
              <DueLine
                inspection={inspection}
                title={inspection.siteName}
                detail={`${KIND_SHORT[inspection.kind]}${key ? ` · ${key.label}` : ''}`}
              />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function PlainRows({ items }: { items: Inspection[] }) {
  return (
    <ul className="rows">
      {items.map((inspection) => (
        <li key={`${inspection.siteId}-${inspection.kind}`}>
          <Link to={link(inspection)} className="row-link">
            <span className="row-title">{inspection.siteName}</span>
            <span className="row-meta">{KIND_SHORT[inspection.kind]}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
