import { ONBOARDING_LABELS } from '@obsio/shared';
import { ArrowLeft, Check } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { useClientDetail } from './api.js';
import { AuditList } from './AuditPage.js';
import { ClientPanel } from './ClientsPage.js';
import { DailyBars } from './DailyBars.js';
import { Loading } from '../components/Loading.js';

const number = new Intl.NumberFormat('fr-FR');

/** Fiche d'un client : licence, démarrage, activité sur 90 jours et historique. */
export function ClientPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const { data, error, isPending } = useClientDetail(clientId!);
  if (isPending) return <Loading shape="detail" />;
  if (error) return <p className="error">{error.message}</p>;

  const { client, onboarding, activity, audit } = data;
  const done = onboarding.filter((step) => step.done).length;
  const views = activity.reduce((sum, day) => sum + day.pageViews, 0);
  const analyses = activity.reduce((sum, day) => sum + day.analyses, 0);

  return (
    <div className="console-page">
      <Link to="/console" className="console-back">
        <ArrowLeft size={16} strokeWidth={1.5} aria-hidden />
        Clients
      </Link>
      <h1>{client.name}</h1>

      <div className="client-layout">
        <div className="client-main">
          <section className="usage-card">
            <div className="usage-card-head">
              <h2>Activité sur 90 jours</h2>
              <p className="hint">
                {number.format(views)} pages vues · {number.format(analyses)} analyse
                {analyses > 1 ? 's' : ''}
              </p>
            </div>
            <DailyBars
              days={activity}
              value={(day) => day.pageViews}
              format={number.format}
              label="Pages vues par jour"
              empty="Aucune page vue sur les 90 derniers jours"
              tooltip={(day) => (
                <>
                  <span>{number.format(day.pageViews)} pages vues</span>
                  <span>
                    {day.analyses} analyse{day.analyses > 1 ? 's' : ''}
                  </span>
                </>
              )}
            />
          </section>

          <section className="usage-card">
            <div className="usage-card-head">
              <h2>Démarrage</h2>
              <p className="hint">
                {done} étape{done > 1 ? 's' : ''} sur {onboarding.length}
              </p>
            </div>
            <div className="onboarding-bar" aria-hidden>
              <span style={{ width: `${(done / onboarding.length) * 100}%` }} />
            </div>
            <ol className="onboarding">
              {onboarding.map((step) => (
                <li key={step.step} className={step.done ? 'done' : undefined}>
                  <span className="onboarding-mark" aria-hidden>
                    {step.done && <Check size={14} strokeWidth={1.5} />}
                  </span>
                  {ONBOARDING_LABELS[step.step]}
                  <span className="visually-hidden">{step.done ? ' : fait' : ' : à faire'}</span>
                </li>
              ))}
            </ol>
          </section>

          <section className="usage-card">
            <h2>Historique de la licence</h2>
            {audit.length === 0 ? (
              <p className="hint">Aucune action de l'équipe sur ce client</p>
            ) : (
              <AuditList entries={audit} showClient={false} />
            )}
          </section>
        </div>
        <ClientPanel client={client} />
      </div>
    </div>
  );
}
