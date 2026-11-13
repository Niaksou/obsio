import { PAGE_LABELS } from '@obsio/shared';
import { useState } from 'react';
import { useUsage } from './api.js';
import { DailyBars } from './DailyBars.js';
import { Loading } from '../components/Loading.js';

const number = new Intl.NumberFormat('fr-FR');
const euros = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const percent = (part: number, total: number) =>
  total === 0 ? '—' : `${Math.round((part / total) * 100)} %`;

const PERIODS = [7, 30, 90] as const;

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
      {isPending && <Loading inline />}
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
            <DailyBars
              days={usage.days}
              value={(day) => day.cost}
              format={euros.format}
              label="Coût estimé par jour"
              empty="Aucune consommation d'extraction sur la période."
              tooltip={(day) => (
                <>
                  <span>{euros.format(day.cost)} estimés</span>
                  <span>
                    {day.analyses} analyse{day.analyses > 1 ? 's' : ''}
                    {day.failures > 0 && `, ${day.failures} en échec`}
                  </span>
                  <span>{number.format(day.ocrPages)} pages OCR</span>
                  <span>
                    {number.format(day.promptTokens + day.completionTokens)} jetons ·{' '}
                    {number.format(day.pageViews)} pages vues
                  </span>
                </>
              )}
            />
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
                        <td data-label="Prompt">{q.promptVersion}</td>
                        <td className="num" data-label="Gardés">
                          {percent(q.kept, total)} <span className="hint">({q.kept})</span>
                        </td>
                        <td className="num" data-label="Corrigés">
                          {percent(q.edited, total)} <span className="hint">({q.edited})</span>
                        </td>
                        <td className="num" data-label="Écartés">
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
