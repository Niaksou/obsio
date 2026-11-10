import { Q18_CONSTATATIONS, type SiteDashboard as Dashboard } from '@obsio/shared';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api } from '../api.js';
import { keys } from '../queries.js';
import { formatDay, plural } from './status.js';

/** Tableau de bord d'un site : alertes du dernier Q18, compteurs, étages à traiter. */
export function SiteDashboard({ siteId }: { siteId: string }) {
  const dashboard = useQuery({
    queryKey: keys.dashboard(siteId),
    queryFn: () => api.dashboard(siteId),
  });
  if (dashboard.error) return <p className="error">{dashboard.error.message}</p>;
  if (!dashboard.data) return null;
  const { counts, floors, unattached, q18 } = dashboard.data;
  const list = (vue?: string) => `/sites/${siteId}/reserves${vue ? `?vue=${vue}` : ''}`;

  return (
    <section className="dashboard" aria-label="Tableau de bord" data-tour="site-dashboard">
      <Q18Alerts q18={q18} />

      <ul className="counters">
        <Counter to={list()} value={counts.open} label="en cours" />
        <Counter
          to={list('en_retard')}
          value={counts.overdue}
          label="en retard"
          tone={counts.overdue ? 'danger' : undefined}
        />
        <Counter
          to={list('a_verifier')}
          value={counts.toVerify}
          label="corrigées, à vérifier"
          tone={counts.toVerify ? 'pending' : undefined}
        />
        <Counter to={list()} value={counts.reconduites} label="reconduites" />
        <Counter to={list('levees')} value={counts.levees} label="levées" />
      </ul>

      <Progress counts={counts} />

      {(floors.length > 0 || unattached > 0) && (
        <ul className="rows floor-load">
          {floors.map((floor) => (
            <li key={floor.floorId}>
              <Link to={`/etages/${floor.floorId}`} className="row-link">
                <span className="row-title">
                  {floor.buildingName}, {floor.floorName}
                </span>
                <span className="row-meta">{plural(floor.open, 'réserve')} en cours</span>
                {floor.overdue > 0 && (
                  <span className="status late">{floor.overdue} en retard</span>
                )}
              </Link>
            </li>
          ))}
          {unattached > 0 && (
            <li>
              <Link to={list()} className="row-link">
                <span className="row-title">Sans équipement rattaché</span>
                <span className="row-meta">{plural(unattached, 'réserve')} en cours</span>
              </Link>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

function Counter({
  to,
  value,
  label,
  tone,
}: {
  to: string;
  value: number;
  label: string;
  tone?: 'danger' | 'pending';
}) {
  return (
    <li>
      <Link to={to} className={tone ? `counter counter-${tone}` : 'counter'}>
        <span className="counter-value">{value}</span>
        <span className="counter-label">{label}</span>
      </Link>
    </li>
  );
}

/**
 * Avancement du site : une barre unique, une part par état, de la plus urgente à la levée.
 * Les quatre parts sont disjointes : en retard et en cours (ouvertes ou assignées), corrigées
 * à vérifier, levées.
 */
function Progress({ counts }: { counts: Dashboard['counts'] }) {
  const total = counts.open + counts.toVerify + counts.levees;
  if (total === 0) return null;
  const parts = [
    { key: 'overdue', label: 'en retard', value: counts.overdue },
    { key: 'open', label: 'en cours', value: counts.open - counts.overdue },
    { key: 'verify', label: 'à vérifier', value: counts.toVerify },
    { key: 'done', label: 'levées', value: counts.levees },
  ];
  return (
    <figure className="progress">
      <figcaption className="progress-caption">
        <span className="progress-figure">{Math.round((counts.levees / total) * 100)} %</span>
        <span>
          des réserves levées, {counts.levees} sur {total}
        </span>
      </figcaption>
      <div className="progress-bar" aria-hidden="true">
        {parts
          .filter((p) => p.value > 0)
          .map((p) => (
            <span key={p.key} className={`progress-${p.key}`} style={{ flexGrow: p.value }} />
          ))}
      </div>
      <ul className="progress-legend">
        {parts.map((p) => (
          <li key={p.key}>
            <span className={`dot progress-${p.key}`} aria-hidden="true" />
            {p.label}
            <span className="progress-value">{p.value}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

function Q18Alerts({ q18 }: { q18: Dashboard['q18'] }) {
  if (!q18) return null;
  const source = `Compte rendu Q18 de ${q18.organisme}${q18.dateVisite ? `, visite du ${formatDay(q18.dateVisite)}` : ''}`;
  const risk = q18.conclusion === 'risque';
  if (!risk && q18.nonVerifiees.length === 0) return null;
  return (
    <div className="alerts">
      {risk && (
        <div className="alert alert-danger" role="alert">
          <p className="alert-title">Risque d’incendie ou d’explosion signalé par le dernier Q18</p>
          <p className="row-meta">{source}</p>
          {q18.dangers.length > 0 && (
            <ul>
              {q18.dangers.map((n) => (
                <li key={n}>
                  Constatation {n} : {Q18_CONSTATATIONS[n]}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {q18.nonVerifiees.length > 0 && (
        <div className="alert alert-pending">
          <p className="alert-title">
            {q18.nonVerifiees.length > 1
              ? `${q18.nonVerifiees.length} constatations du Q18 n’ont pas été vérifiées`
              : 'Une constatation du Q18 n’a pas été vérifiée'}
          </p>
          <p className="row-meta">{source}. Demandez à l’organisme de les vérifier.</p>
          <ul>
            {q18.nonVerifiees.map((n) => (
              <li key={n}>
                Constatation {n} : {Q18_CONSTATATIONS[n]}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
