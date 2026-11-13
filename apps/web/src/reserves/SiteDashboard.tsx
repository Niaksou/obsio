import { Q18_CONSTATATIONS, type SiteDashboard as Dashboard } from '@obsio/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { FileDown } from 'lucide-react';
import { Link } from 'react-router';
import { api, downloadProofDossier } from '../api.js';
import { MutationError } from '../components/MutationError.js';
import { keys } from '../queries.js';
import { formatDay, plural } from './status.js';

function useDashboard(siteId: string) {
  return useQuery({ queryKey: keys.dashboard(siteId), queryFn: () => api.dashboard(siteId) });
}

/** Alertes du dernier compte rendu Q18, en tête de la page du site. */
export function SiteAlerts({ siteId }: { siteId: string }) {
  const dashboard = useDashboard(siteId);
  if (!dashboard.data?.q18) return null;
  return <Q18Alerts q18={dashboard.data.q18} />;
}

/**
 * Rapport de levée : le dossier des réserves levées, signé et vérifiable, en un clic depuis
 * l'avancement ; les autres options (origine, toutes les réserves) sont sur la page des réserves.
 */
function LiftedReport({ siteId }: { siteId: string }) {
  const download = useMutation({
    mutationFn: () => downloadProofDossier(siteId, { scope: 'levees' }),
  });
  return (
    <div className="progress-report" data-tour="site-report">
      <div>
        <h3>Rapport de levée des réserves</h3>
        <p className="hint">
          PDF signé avec l’historique et les photos de chaque correction.{' '}
          <Link to={`/sites/${siteId}/reserves#dossier`}>Autres options</Link>
        </p>
      </div>
      <button
        type="button"
        className="secondary compact"
        disabled={download.isPending}
        onClick={() => download.mutate()}
      >
        <FileDown size={16} strokeWidth={1.5} aria-hidden />
        {download.isPending ? 'Préparation…' : 'Télécharger'}
      </button>
      <MutationError error={download.error} />
    </div>
  );
}

/**
 * Avancement d'un site : part des réserves levées, une barre par état (chaque état mène à la
 * liste filtrée), puis les étages où il reste du travail.
 */
export function SiteProgress({ siteId, isManager }: { siteId: string; isManager: boolean }) {
  const dashboard = useDashboard(siteId);
  if (dashboard.error) return <p className="error">{dashboard.error.message}</p>;
  if (!dashboard.data) return null;
  const { counts, floors, unattached } = dashboard.data;
  const list = (vue?: string) => `/sites/${siteId}/reserves${vue ? `?vue=${vue}` : ''}`;
  const total = counts.open + counts.toVerify + counts.levees;

  return (
    <section
      className="site-card site-progress"
      data-tour="site-dashboard"
      aria-labelledby="progress-title"
    >
      <h2 id="progress-title" className="visually-hidden">
        Avancement
      </h2>
      {total === 0 ? (
        <p className="empty">
          {isManager
            ? 'Aucune réserve active. Importez le rapport de l’organisme de contrôle pour commencer le suivi.'
            : 'Aucune réserve active sur ce site.'}
        </p>
      ) : (
        <Progress counts={counts} total={total} list={list} />
      )}

      {isManager && counts.levees > 0 && <LiftedReport siteId={siteId} />}

      {(floors.length > 0 || unattached > 0) && (
        <div className="progress-floors">
          <h3>Reste à traiter par étage</h3>
          <ul>
            {floors.map((floor) => (
              <li key={floor.floorId}>
                <Link to={`/etages/${floor.floorId}`}>
                  <span className="row-title">
                    {floor.buildingName}, {floor.floorName}
                  </span>
                  <span className="progress-floor-count">
                    {floor.overdue > 0 && (
                      <span className="late">{floor.overdue} en retard · </span>
                    )}
                    {plural(floor.open, 'réserve')}
                  </span>
                </Link>
              </li>
            ))}
            {unattached > 0 && (
              <li>
                <Link to={list()}>
                  <span className="row-title">Sans équipement rattaché</span>
                  <span className="progress-floor-count">{plural(unattached, 'réserve')}</span>
                </Link>
              </li>
            )}
          </ul>
        </div>
      )}
    </section>
  );
}

/**
 * Une barre unique, une part par état, de la plus urgente à la levée. Les quatre parts sont
 * disjointes : en retard et en cours (ouvertes ou assignées), corrigées à vérifier, levées.
 */
function Progress({
  counts,
  total,
  list,
}: {
  counts: Dashboard['counts'];
  total: number;
  list: (vue?: string) => string;
}) {
  const parts = [
    { key: 'overdue', label: 'En retard', value: counts.overdue, to: list('en_retard') },
    { key: 'open', label: 'En cours', value: counts.open - counts.overdue, to: list() },
    {
      key: 'verify',
      label: 'Corrigées, à vérifier',
      value: counts.toVerify,
      to: list('a_verifier'),
    },
    { key: 'done', label: 'Levées', value: counts.levees, to: list('levees') },
  ];
  return (
    <figure className="progress">
      <figcaption className="progress-caption">
        <span className="progress-figure">{Math.round((counts.levees / total) * 100)} %</span>
        <span>
          des réserves levées
          <small>
            {counts.levees} sur {total}
            {counts.reconduites > 0 && `, dont ${counts.reconduites} reconduites`}
          </small>
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
            <Link to={p.to}>
              <span className={`dot progress-${p.key}`} aria-hidden="true" />
              <span>{p.label}</span>
              <span className="progress-value">{p.value}</span>
            </Link>
          </li>
        ))}
      </ul>
    </figure>
  );
}

function Q18Alerts({ q18 }: { q18: NonNullable<Dashboard['q18']> }) {
  const source = `Compte rendu Q18 de ${q18.organisme}${q18.dateVisite ? `, visite du ${formatDay(q18.dateVisite)}` : ''}`;
  const risk = q18.conclusion === 'risque';
  if (!risk && q18.nonVerifiees.length === 0) return null;
  return (
    <section className="site-alert" aria-label="Alertes du dernier Q18">
      {risk && (
        <div className="site-alert-part" role="alert">
          <h2 className="site-alert-title danger">
            Risque d’incendie ou d’explosion signalé par le dernier Q18
          </h2>
          {q18.dangers.length > 0 && (
            <ul>
              {q18.dangers.map((n) => (
                <li key={n}>
                  <span className="q18-number">{n}</span>
                  {Q18_CONSTATATIONS[n]}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {q18.nonVerifiees.length > 0 && (
        <div className="site-alert-part">
          <h2 className="site-alert-title pending">
            {q18.nonVerifiees.length > 1
              ? `${q18.nonVerifiees.length} constatations n’ont pas été vérifiées`
              : 'Une constatation n’a pas été vérifiée'}
          </h2>
          <p className="hint">
            Demandez à l’organisme{' '}
            {q18.nonVerifiees.length > 1 ? 'de les vérifier' : 'de la vérifier'} lors de sa
            prochaine visite
          </p>
          <ul>
            {q18.nonVerifiees.map((n) => (
              <li key={n}>
                <span className="q18-number">{n}</span>
                {Q18_CONSTATATIONS[n]}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="site-alert-source">{source}</p>
    </section>
  );
}
