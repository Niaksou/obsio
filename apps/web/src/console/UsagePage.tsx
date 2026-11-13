import { PAGE_LABELS, type ConsoleUsage } from '@obsio/shared';
import { useState } from 'react';
import { useUsage } from './api.js';

const number = new Intl.NumberFormat('fr-FR');
const euros = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const dayFormat = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});
const formatDay = (iso: string) => dayFormat.format(new Date(`${iso}T00:00:00Z`));
const percent = (part: number, total: number) =>
  total === 0 ? '—' : `${Math.round((part / total) * 100)} %`;

const PERIODS = [7, 30, 90] as const;

type Day = ConsoleUsage['days'][number];

/** Graphique principal : coût estimé par jour, barres fines, détail au survol. */
function CostChart({ days }: { days: Day[] }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const max = Math.max(...days.map((d) => d.cost));
  if (max === 0) {
    return <p className="empty">Aucune consommation d'extraction sur la période.</p>;
  }
  // Repère en unités du graphique : une colonne de 10 par jour, 100 de haut ; les textes sont
  // en HTML pour garder leur taille quelle que soit la largeur.
  const slot = 10;
  const width = days.length * slot;
  const height = 100;
  const active = hovered === null ? null : days[hovered]!;
  const labelled = [0, Math.floor((days.length - 1) / 2), days.length - 1];

  return (
    <figure className="usage-chart">
      <div className="usage-chart-plot">
        <span className="usage-axis usage-axis-max">{euros.format(max)}</span>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`Coût estimé par jour, du ${formatDay(days[0]!.day)} au ${formatDay(days.at(-1)!.day)}, ${euros.format(max)} au plus`}
          onMouseLeave={() => setHovered(null)}
        >
          <line x1={0} x2={width} y1={0.5} y2={0.5} className="usage-grid" />
          <line x1={0} x2={width} y1={height / 2} y2={height / 2} className="usage-grid" />
          {days.map((day, index) => {
            const h = Math.max((height * day.cost) / max, day.cost > 0 ? 1.5 : 0);
            return (
              <g key={day.day} onMouseEnter={() => setHovered(index)}>
                {/* Zone de survol sur toute la hauteur, plus large que la barre. */}
                <rect x={index * slot} y={0} width={slot} height={height} fill="transparent" />
                {h > 0 && (
                  <rect
                    className={hovered === index ? 'usage-bar hover' : 'usage-bar'}
                    x={index * slot + slot * 0.2}
                    y={height - h}
                    width={slot * 0.6}
                    height={h}
                  />
                )}
              </g>
            );
          })}
          <line x1={0} x2={width} y1={height - 0.5} y2={height - 0.5} className="usage-baseline" />
        </svg>
        {active && (
          <div
            className="usage-tooltip"
            style={{
              left: `${((hovered! + 0.5) / days.length) * 100}%`,
              transform: `translateX(${hovered! > days.length / 2 ? 'calc(-100% - 8px)' : '8px'})`,
            }}
          >
            <strong>{formatDay(active.day)}</strong>
            <span>{euros.format(active.cost)} estimés</span>
            <span>
              {active.analyses} analyse{active.analyses > 1 ? 's' : ''}
              {active.failures > 0 && `, ${active.failures} en échec`}
            </span>
            <span>{number.format(active.ocrPages)} pages OCR</span>
            <span>
              {number.format(active.promptTokens + active.completionTokens)} jetons ·{' '}
              {number.format(active.pageViews)} pages vues
            </span>
          </div>
        )}
      </div>
      <div className="usage-dates">
        {labelled.map((index) => (
          <span key={index} className="usage-axis">
            {formatDay(days[index]!.day)}
          </span>
        ))}
      </div>
    </figure>
  );
}

/** Liste classée avec barre fine : part de chaque ligne dans le maximum. */
function RankedList({
  rows,
  empty,
}: {
  rows: { key: string; label: string; value: number; display: string; meta?: string }[];
  empty: string;
}) {
  if (rows.length === 0) return <p className="empty">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ol className="ranked">
      {rows.map((row) => (
        <li key={row.key}>
          <div className="ranked-line">
            <span>{row.label}</span>
            <span className="ranked-value">{row.display}</span>
          </div>
          <div className="ranked-bar" aria-hidden>
            <span style={{ width: `${(row.value / max) * 100}%` }} />
          </div>
          {row.meta && <span className="ranked-meta">{row.meta}</span>}
        </li>
      ))}
    </ol>
  );
}

export function UsagePage() {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>(30);
  const { data: usage, error, isPending } = useUsage(period);

  const totals = usage?.days.reduce(
    (sum, d) => ({
      cost: sum.cost + d.cost,
      analyses: sum.analyses + d.analyses,
      failures: sum.failures + d.failures,
      ocrPages: sum.ocrPages + d.ocrPages,
      pageViews: sum.pageViews + d.pageViews,
    }),
    { cost: 0, analyses: 0, failures: 0, ocrPages: 0, pageViews: 0 },
  );

  return (
    <div className="console-page">
      <div className="console-head">
        <h1>Usage</h1>
        <div className="segmented segmented-small" role="group" aria-label="Période">
          {PERIODS.map((days) => (
            <button
              key={days}
              type="button"
              aria-pressed={period === days}
              onClick={() => setPeriod(days)}
            >
              {days} jours
            </button>
          ))}
        </div>
      </div>
      {isPending && <p className="loading">Chargement…</p>}
      {error && <p className="error">{error.message}</p>}
      {usage && totals && (
        <>
          <dl className="console-figures">
            <div>
              <dt>Coût estimé</dt>
              <dd>{euros.format(totals.cost)}</dd>
            </div>
            <div>
              <dt>Analyses</dt>
              <dd>{number.format(totals.analyses)}</dd>
            </div>
            <div className={totals.failures > 0 ? 'alert-figure' : undefined}>
              <dt>Échecs</dt>
              <dd>{percent(totals.failures, totals.analyses)}</dd>
            </div>
            <div>
              <dt>Pages OCR</dt>
              <dd>{number.format(totals.ocrPages)}</dd>
            </div>
            <div>
              <dt>Pages vues</dt>
              <dd>{number.format(totals.pageViews)}</dd>
            </div>
          </dl>

          <section className="usage-card">
            <div className="usage-card-head">
              <h2>Coût estimé par jour</h2>
              <p className="hint">
                OCR {euros.format(usage.prices.ocrPer1000Pages)} / 1 000 pages · entrée{' '}
                {euros.format(usage.prices.inputPerMillionTokens)} / M jetons · sortie{' '}
                {euros.format(usage.prices.outputPerMillionTokens)} / M jetons
              </p>
            </div>
            <CostChart days={usage.days} />
          </section>

          <div className="usage-columns">
            <section className="usage-card">
              <h2>Par client</h2>
              <RankedList
                empty="Aucun client."
                rows={usage.clients.map((c) => ({
                  key: c.id,
                  label: c.name,
                  value: c.cost,
                  display: euros.format(c.cost),
                  meta: `${c.analyses} analyse${c.analyses > 1 ? 's' : ''}${c.failures ? ` dont ${c.failures} en échec` : ''} · ${number.format(c.ocrPages)} pages OCR · ${number.format(c.pageViews)} pages vues`,
                }))}
              />
            </section>
            <section className="usage-card">
              <h2>Pages les plus vues</h2>
              <RankedList
                empty="Aucune page vue sur la période."
                rows={usage.pages.map((p) => ({
                  key: p.path,
                  label: PAGE_LABELS[p.path],
                  value: p.views,
                  display: number.format(p.views),
                }))}
              />
            </section>
          </div>

          <section className="usage-card">
            <div className="usage-card-head">
              <h2>Qualité de l'extraction</h2>
              <p className="hint">Points extraits déjà tranchés par les clients</p>
            </div>
            {usage.quality.length === 0 ? (
              <p className="empty">Aucun brouillon tranché sur la période.</p>
            ) : (
              <table className="console-table quality-table">
                <thead>
                  <tr>
                    <th scope="col">Modèle</th>
                    <th scope="col">Prompt</th>
                    <th scope="col" className="num">
                      Gardés tels quels
                    </th>
                    <th scope="col" className="num">
                      Corrigés
                    </th>
                    <th scope="col" className="num">
                      Écartés
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {usage.quality.map((q) => {
                    const total = q.kept + q.edited + q.rejected;
                    return (
                      <tr key={`${q.model}-${q.promptVersion}`}>
                        <th scope="row">{q.model}</th>
                        <td>{q.promptVersion}</td>
                        <td className="num">
                          {percent(q.kept, total)} <span className="hint">({q.kept})</span>
                        </td>
                        <td className="num">
                          {percent(q.edited, total)} <span className="hint">({q.edited})</span>
                        </td>
                        <td className="num">
                          {percent(q.rejected, total)} <span className="hint">({q.rejected})</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </div>
  );
}
