import { LICENCE_PLAN_LABELS, type ConsoleAuditEntry, type LicencePlan } from '@obsio/shared';
import { useAudit } from './api.js';
import { Loading } from '../components/Loading.js';

const dayFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeZone: 'UTC' });
const timeFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });

const ACTIONS: Record<string, string> = {
  'client.cree': 'Client ouvert',
  'licence.modifiee': 'Licence modifiée',
  'licence.suspendue': 'Licence suspendue',
  'licence.revoquee': 'Licence révoquée',
  'licence.reactivee': 'Licence réactivée',
};

const FIELDS: Record<string, string> = {
  plan: 'formule',
  status: 'état',
  startsOn: 'début',
  endsOn: 'fin',
  maxSites: 'sites',
  maxMembers: 'utilisateurs',
  maxAnalysesPerMonth: 'analyses par mois',
  note: 'note',
};

function value(field: string, raw: unknown) {
  if (raw === null || raw === undefined || raw === '') return field.startsWith('max') ? '∞' : '—';
  if (field === 'plan') return LICENCE_PLAN_LABELS[raw as LicencePlan] ?? String(raw);
  if (field === 'startsOn' || field === 'endsOn') return dayFormat.format(new Date(String(raw)));
  return String(raw);
}

/** Détail lisible : les champs changés, « avant → après ». */
function Details({ entry }: { entry: ConsoleAuditEntry }) {
  if (entry.action === 'client.cree') return null;
  const changes = Object.entries(entry.details) as [string, { avant: unknown; apres: unknown }][];
  return (
    <ul className="audit-changes">
      {changes.map(([field, change]) => (
        <li key={field}>
          <span className="audit-field">{FIELDS[field] ?? field}</span> {value(field, change.avant)}{' '}
          → {value(field, change.apres)}
        </li>
      ))}
    </ul>
  );
}

/** Actions de la console, la plus récente d'abord. `showClient` : nom du client visé. */
export function AuditList({
  entries,
  showClient = true,
}: {
  entries: ConsoleAuditEntry[];
  showClient?: boolean;
}) {
  return (
    <ol className="audit-list">
      {entries.map((entry) => (
        <li key={entry.id}>
          <time dateTime={entry.createdAt}>{timeFormat.format(new Date(entry.createdAt))}</time>
          <div>
            <p>
              <strong>{ACTIONS[entry.action] ?? entry.action}</strong>
              {showClient && entry.organisationName && <> · {entry.organisationName}</>}
              {showClient && entry.organisationId && !entry.organisationName && (
                <> · client supprimé</>
              )}
            </p>
            <Details entry={entry} />
          </div>
          <span className="audit-actor">{entry.actor}</span>
        </li>
      ))}
    </ol>
  );
}

export function AuditPage() {
  const { data: entries, error, isPending } = useAudit();
  if (isPending) return <Loading />;
  if (error) return <p className="error">{error.message}</p>;
  return (
    <div className="console-page">
      <div className="console-head">
        <h1>Journal</h1>
        <p className="hint">Les 200 dernières actions de l'équipe, non modifiables</p>
      </div>
      {entries.length === 0 ? (
        <p className="empty">Aucune action pour l'instant</p>
      ) : (
        <AuditList entries={entries} />
      )}
    </div>
  );
}
