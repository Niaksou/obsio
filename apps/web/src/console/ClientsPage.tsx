import {
  defaultLicence,
  LICENCE_PLAN_LABELS,
  parisDate,
  type ConsoleClient,
  type Licence,
} from '@obsio/shared';
import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { ConfirmButton } from '../components/ConfirmButton.js';
import { MutationError } from '../components/MutationError.js';
import { useClients, useCreateClient, useSaveLicence } from './api.js';
import { LicenceFields, useLicenceSubmit } from './LicenceForm.js';

const iconProps = { size: 18, strokeWidth: 1.5, 'aria-hidden': true } as const;

/** Échéance proche : signalée à 30 jours. */
const SOON_DAYS = 30;

const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeZone: 'UTC' });
const formatDate = (iso: string) => dateFormat.format(new Date(iso));
const number = new Intl.NumberFormat('fr-FR');

const READ_ONLY_LABELS = { suspendue: 'Suspendue', revoquee: 'Révoquée', expiree: 'Échue' };

function sinceLabel(iso: string | null) {
  if (!iso) return 'Jamais';
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  if (days === 0) return "Aujourd'hui";
  if (days === 1) return 'Hier';
  return `Il y a ${days} j`;
}

function addDays(iso: string, days: number) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Fin d'une période d'un an commencée ce jour-là (veille de l'anniversaire). */
function addYear(iso: string) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCFullYear(date.getUTCFullYear() + 1);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

type Tone = 'off' | 'soon' | 'ok' | 'open';

function tone(client: ConsoleClient): Tone {
  if (client.access.access === 'lecture') return 'off';
  if (client.access.daysLeft === null) return 'open';
  return client.access.daysLeft <= SOON_DAYS ? 'soon' : 'ok';
}

/** Durée de la licence : part écoulée entre le début et la fin, couleur selon l'état. */
function LicenceTrack({ client }: { client: ConsoleClient }) {
  const { licence, access } = client;
  const today = parisDate();
  let elapsed = 0;
  if (licence.endsOn) {
    const total = Date.parse(licence.endsOn) - Date.parse(licence.startsOn) + 86_400_000;
    elapsed = Math.min(1, Math.max(0, (Date.parse(today) - Date.parse(licence.startsOn)) / total));
  }
  const caption = access.reason
    ? READ_ONLY_LABELS[access.reason]
    : access.daysLeft === null
      ? 'Sans échéance'
      : access.daysLeft === 0
        ? "Finit aujourd'hui"
        : `${access.daysLeft} j restants`;
  return (
    <div className={`licence-track tone-${tone(client)}`}>
      <div className="licence-track-head">
        <span>{LICENCE_PLAN_LABELS[licence.plan]}</span>
        <span className="licence-track-caption">{caption}</span>
      </div>
      <div className="licence-track-bar" aria-hidden>
        <span style={{ width: `${elapsed * 100}%` }} />
      </div>
      <span className="licence-track-dates">
        {formatDate(licence.startsOn)} → {licence.endsOn ? formatDate(licence.endsOn) : '…'}
      </span>
    </div>
  );
}

function ofCap(value: number, cap: number | null) {
  return cap === null ? number.format(value) : `${number.format(value)} / ${number.format(cap)}`;
}

/** Chiffres d'ensemble : ce qui demande une action se lit en premier. */
function Overview({ clients }: { clients: ConsoleClient[] }) {
  const readOnly = clients.filter((c) => c.access.access === 'lecture').length;
  const soon = clients.filter((c) => tone(c) === 'soon').length;
  const analyses = clients.reduce((sum, c) => sum + c.analysesThisMonth, 0);
  const pages = clients.reduce((sum, c) => sum + c.ocrPagesThisMonth, 0);
  const figures = [
    { label: 'Clients', value: clients.length },
    { label: 'Échéance sous 30 jours', value: soon, alert: soon > 0 },
    { label: 'En lecture seule', value: readOnly },
    { label: 'Analyses ce mois', value: analyses },
    { label: 'Pages OCR ce mois', value: pages },
  ];
  return (
    <dl className="console-figures">
      {figures.map((figure) => (
        <div key={figure.label} className={figure.alert ? 'alert-figure' : undefined}>
          <dt>{figure.label}</dt>
          <dd>{number.format(figure.value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function NewClient({ onDone }: { onDone: () => void }) {
  const create = useCreateClient();
  const { error, onSubmit } = useLicenceSubmit('active', (licence, form) => {
    const data = new FormData(form);
    create.mutate(
      {
        name: String(data.get('name') ?? '').trim(),
        adminEmail: String(data.get('adminEmail') ?? '').trim(),
        licence,
      },
      { onSuccess: onDone },
    );
  });
  const today = parisDate();
  return (
    <form className="console-panel" onSubmit={onSubmit}>
      <div className="console-panel-head">
        <h2>Nouveau client</h2>
        <button type="button" className="quiet icon-only" aria-label="Fermer" onClick={onDone}>
          <X {...iconProps} />
        </button>
      </div>
      <p className="hint">
        Crée l'organisation et envoie l'invitation à son premier administrateur, comme{' '}
        <code>pnpm org:create</code>.
      </p>
      <div className="console-fields stacked">
        <label>
          Nom du client
          <input name="name" required maxLength={200} autoComplete="off" autoFocus />
        </label>
        <label>
          E-mail de l'administrateur
          <input name="adminEmail" type="email" required autoComplete="off" />
        </label>
      </div>
      {/* Par défaut, un essai d'un mois. */}
      <LicenceFields
        licence={{ ...defaultLicence(today), plan: 'essai', endsOn: addDays(today, 30) }}
      />
      {error && <p className="error">{error}</p>}
      <MutationError error={create.error} />
      <div className="actions">
        <button type="submit" disabled={create.isPending}>
          Ouvrir le client
        </button>
      </div>
    </form>
  );
}

export function ClientPanel({
  client,
  onClose,
}: {
  client: ConsoleClient;
  /** Absent sur la fiche du client, où le volet est toujours ouvert. */
  onClose?: () => void;
}) {
  const save = useSaveLicence();
  const { licence } = client;
  const submit = (next: Licence) => save.mutate({ id: client.id, licence: next });
  const { error, onSubmit } = useLicenceSubmit(licence.status, submit);
  const today = parisDate();

  return (
    <section className="console-panel" aria-label={`Licence de ${client.name}`}>
      <div className="console-panel-head">
        <div>
          <h2>{onClose ? client.name : 'Licence'}</h2>
          <p className="hint">
            Client depuis le {formatDate(client.createdAt)} · {client.members} membre
            {client.members > 1 ? 's' : ''}
            {client.pendingInvitations > 0 &&
              `, ${client.pendingInvitations} invitation en attente`}
          </p>
        </div>
        {onClose && (
          <button type="button" className="quiet icon-only" aria-label="Fermer" onClick={onClose}>
            <X {...iconProps} />
          </button>
        )}
      </div>
      {onClose && (
        <Link to={`/console/clients/${client.id}`} className="console-more">
          Fiche du client : démarrage, activité, historique
        </Link>
      )}

      <div className="console-actions">
        {licence.status === 'active' ? (
          <>
            <button
              type="button"
              className="secondary"
              disabled={save.isPending}
              onClick={() =>
                submit({
                  ...licence,
                  // D'un an après l'échéance en cours, ou à partir d'aujourd'hui si elle est passée.
                  endsOn: addYear(
                    licence.endsOn && licence.endsOn >= today ? addDays(licence.endsOn, 1) : today,
                  ),
                })
              }
            >
              Prolonger d'un an
            </button>
            <button
              type="button"
              className="secondary"
              disabled={save.isPending}
              onClick={() => submit({ ...licence, status: 'suspendue' })}
            >
              Suspendre
            </button>
            <ConfirmButton
              label="Révoquer"
              confirmLabel="Révoquer la licence"
              disabled={save.isPending}
              onConfirm={() => submit({ ...licence, status: 'revoquee' })}
            />
          </>
        ) : (
          <button
            type="button"
            disabled={save.isPending}
            onClick={() => submit({ ...licence, status: 'active' })}
          >
            Réactiver
          </button>
        )}
      </div>
      <p className="hint">
        Suspendue, révoquée ou échue, la licence laisse le client en lecture seule : ses données
        restent consultables et exportables.
      </p>

      {/* Remonté à chaque enregistrement : les champs repartent des valeurs enregistrées. */}
      <form key={JSON.stringify(licence)} className="console-form" onSubmit={onSubmit}>
        <LicenceFields licence={licence} />
        {error && <p className="error">{error}</p>}
        <MutationError error={save.error} />
        <div className="actions">
          <button type="submit" className="secondary" disabled={save.isPending}>
            Enregistrer les conditions
          </button>
        </div>
      </form>
    </section>
  );
}

export function ClientsPage() {
  const { data: clients, error, isPending } = useClients();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const selected = clients?.find((c) => c.id === selectedId) ?? null;

  if (isPending) return <p className="loading">Chargement…</p>;
  if (error) return <p className="error">{error.message}</p>;

  return (
    <div className="console-page">
      <div className="console-head">
        <h1>Clients</h1>
        <button
          type="button"
          onClick={() => {
            setSelectedId(null);
            setCreating(true);
          }}
        >
          <Plus {...iconProps} />
          Nouveau client
        </button>
      </div>
      <Overview clients={clients} />

      <div className={selected || creating ? 'console-split open' : 'console-split'}>
        <div className="console-table-wrap">
          <table className="console-table">
            <thead>
              <tr>
                <th scope="col">Client</th>
                <th scope="col">Licence</th>
                <th scope="col" className="num">
                  Utilisateurs
                </th>
                <th scope="col" className="num">
                  Sites
                </th>
                <th scope="col" className="num">
                  Analyses du mois
                </th>
                <th scope="col">Dernière connexion</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => (
                <tr
                  key={client.id}
                  className={client.id === selectedId ? 'selected' : undefined}
                  onClick={() => {
                    setCreating(false);
                    setSelectedId(client.id);
                  }}
                >
                  <th scope="row">
                    <button
                      type="button"
                      className="link"
                      onClick={(event) => {
                        event.stopPropagation();
                        setCreating(false);
                        setSelectedId(client.id);
                      }}
                    >
                      {client.name}
                    </button>
                  </th>
                  <td>
                    <LicenceTrack client={client} />
                  </td>
                  {/* data-label : intitulé affiché sur téléphone, où chaque client devient une carte. */}
                  <td className="num" data-label="Utilisateurs">
                    {ofCap(client.members + client.pendingInvitations, client.licence.maxMembers)}
                  </td>
                  <td className="num" data-label="Sites">
                    {ofCap(client.sites, client.licence.maxSites)}
                  </td>
                  <td className="num" data-label="Analyses">
                    {ofCap(client.analysesThisMonth, client.licence.maxAnalysesPerMonth)}
                  </td>
                  <td className="muted-cell" data-label="Connexion">
                    {sinceLabel(client.lastLoginAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {clients.length === 0 && <p className="empty">Aucun client pour l'instant.</p>}
        </div>
        {creating && <NewClient onDone={() => setCreating(false)} />}
        {selected && !creating && (
          <ClientPanel key={selected.id} client={selected} onClose={() => setSelectedId(null)} />
        )}
      </div>
    </div>
  );
}
