import type { Contractor, ContractorReserve } from '@obsio/shared';
import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { api } from '../api.js';
import { authClient } from '../auth-client.js';
import { field } from '../components/Form.js';
import { Setting, SettingItem, SettingItems, SettingsGroup } from '../components/Settings.js';
import { useSubmit } from '../components/useSubmit.js';
import { dateParts } from '../inspections/describe.js';
import { keys } from '../queries.js';
import { ContractorForm } from '../reserves/ContractorForm.js';
import { summary } from '../reserves/contractors.js';
import { Loading } from '../components/Loading.js';

// Organisation : les membres (avec un compte) et les électriciens externes (sans compte,
// un lien par e-mail), avec le suivi de ce qui leur est confié.

const ROLE_LABELS: Record<string, string> = { admin: 'Administrateur', membre: 'Membre' };

export function Home() {
  const { data: session } = authClient.useSession();
  const { data: organisation } = authClient.useActiveOrganization();
  if (!organisation) return <Loading />;

  const me = organisation.members.find((m) => m.userId === session?.user.id);
  const isAdmin = me?.role === 'admin';

  return (
    <div className="settings-page">
      <header className="settings-head">
        <div>
          <h1>{organisation.name}</h1>
          <p>Vous êtes {(ROLE_LABELS[me?.role ?? ''] ?? me?.role ?? '').toLowerCase()}.</p>
        </div>
      </header>
      <Members
        members={organisation.members}
        invitations={organisation.invitations.filter((i) => i.status === 'pending')}
        isAdmin={isAdmin}
      />
      <Contractors isAdmin={isAdmin} />
    </div>
  );
}

type Organisation = NonNullable<ReturnType<typeof authClient.useActiveOrganization>['data']>;

function Members({
  members,
  invitations,
  isAdmin,
}: {
  members: Organisation['members'];
  invitations: Organisation['invitations'];
  isAdmin: boolean;
}) {
  const [inviting, setInviting] = useState(false);
  return (
    <SettingsGroup title="Membres" description="Avec un compte Obsio.">
      <Setting
        title={`${members.length} membre${members.length > 1 ? 's' : ''}`}
        action={
          isAdmin &&
          !inviting && (
            <button type="button" className="secondary" onClick={() => setInviting(true)}>
              Inviter
            </button>
          )
        }
      >
        {inviting && <InviteMember onDone={() => setInviting(false)} />}
        <SettingItems>
          {members.map((m) => (
            <SettingItem
              key={m.id}
              name={m.user.name}
              detail={m.user.email}
              action={<span className="badge">{ROLE_LABELS[m.role] ?? m.role}</span>}
            />
          ))}
          {invitations.map((i) => (
            <SettingItem
              key={i.id}
              name={i.email}
              detail="Invitation envoyée"
              action={<span className="badge">{ROLE_LABELS[i.role] ?? i.role}</span>}
            />
          ))}
        </SettingItems>
      </Setting>
    </SettingsGroup>
  );
}

function InviteMember({ onDone }: { onDone: () => void }) {
  const { pending, error, run } = useSubmit();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const role = field(data, 'role') === 'admin' ? 'admin' : 'membre';
    const ok = await run(() =>
      authClient.organization.inviteMember({ email: field(data, 'email'), role }),
    );
    if (ok) onDone();
  }

  return (
    <form className="setting-form" onSubmit={(event) => void submit(event)}>
      <div className="fields">
        <label>
          Adresse e-mail
          <input name="email" type="email" required autoComplete="off" />
        </label>
        <label className="narrow">
          Rôle
          <select name="role" defaultValue="membre">
            <option value="membre">Membre</option>
            <option value="admin">Administrateur</option>
          </select>
        </label>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="actions">
        <button type="submit" disabled={pending}>
          {pending ? 'Veuillez patienter…' : 'Envoyer l’invitation'}
        </button>
        <button type="button" className="quiet" onClick={onDone}>
          Annuler
        </button>
      </div>
    </form>
  );
}

function Contractors({ isAdmin }: { isAdmin: boolean }) {
  const contractors = useQuery({ queryKey: keys.contractors, queryFn: api.contractors });
  const reserves = useQuery({ queryKey: keys.contractorReserves, queryFn: api.contractorReserves });
  const [adding, setAdding] = useState(false);

  return (
    <SettingsGroup
      title="Électriciens externes"
      description="Sans compte : un lien par e-mail donne accès aux seules réserves confiées."
    >
      {contractors.error && <p className="error">{contractors.error.message}</p>}
      {contractors.data?.map((contractor) => (
        <ContractorSetting
          key={contractor.id}
          contractor={contractor}
          reserves={(reserves.data ?? []).filter((r) => r.contractorId === contractor.id)}
          isAdmin={isAdmin}
        />
      ))}
      {contractors.data?.length === 0 && !isAdmin && (
        <Setting title="Aucun électricien" status="L’admin les ajoute en confiant une réserve." />
      )}
      {isAdmin && (
        <Setting
          tour="org-add-contractor"
          title="Ajouter un électricien"
          status={
            contractors.data?.length === 0
              ? 'Ou directement en lui confiant une réserve.'
              : undefined
          }
          action={
            !adding && (
              <button type="button" className="secondary" onClick={() => setAdding(true)}>
                Ajouter
              </button>
            )
          }
        >
          {adding && (
            <ContractorForm onSaved={() => setAdding(false)} onCancel={() => setAdding(false)} />
          )}
        </Setting>
      )}
    </SettingsGroup>
  );
}

/** Réserves listées d'emblée par électricien ; les suivantes sur demande. */
const RESERVES_SHOWN = 3;

function ContractorSetting({
  contractor,
  reserves,
  isAdmin,
}: {
  contractor: Contractor;
  reserves: ContractorReserve[];
  isAdmin: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [showAll, setShowAll] = useState(false);
  // Les plus urgentes d'abord : en retard, lien expiré, puis par échéance (déjà triées).
  const sorted = [...reserves].sort((a, b) => urgency(a) - urgency(b));
  const shown = showAll ? sorted : sorted.slice(0, RESERVES_SHOWN);

  return (
    <Setting
      tour="org-contractor"
      title={contractor.name}
      status={[contractor.company, contractor.email].filter(Boolean).join(' · ')}
      action={
        isAdmin &&
        !editing && (
          <button type="button" className="quiet" onClick={() => setEditing(true)}>
            Modifier
          </button>
        )
      }
    >
      {editing && (
        <ContractorForm
          initial={contractor}
          onSaved={() => setEditing(false)}
          onCancel={() => setEditing(false)}
        />
      )}
      <p className="contractor-summary">{summary(reserves)}</p>
      {shown.length > 0 && (
        <SettingItems>
          {shown.map((r) => (
            <li key={r.reserveId}>
              <Link to={`/reserves/${r.reserveId}`} className="setting-link">
                <span className="setting-item-text">
                  <span className="clamp">{r.description}</span>
                  <small>
                    {r.siteName}
                    {r.dueDate && ` · avant le ${shortDay(r.dueDate)}`}
                  </small>
                </span>
                <ReserveFlag reserve={r} />
              </Link>
            </li>
          ))}
        </SettingItems>
      )}
      {shown.length < sorted.length && (
        <button type="button" className="link" onClick={() => setShowAll(true)}>
          Afficher les {sorted.length - shown.length} autres
        </button>
      )}
    </Setting>
  );
}

function urgency(r: ContractorReserve) {
  if (r.overdue) return 0;
  if (r.linkExpired && r.status === 'assignee') return 1;
  return r.status === 'assignee' ? 2 : 3;
}

function ReserveFlag({ reserve }: { reserve: ContractorReserve }) {
  if (reserve.overdue) return <span className="badge badge-danger">En retard</span>;
  if (reserve.status === 'corrigee') return <span className="badge">À vérifier</span>;
  if (reserve.linkExpired) return <span className="badge badge-pending">Lien expiré</span>;
  return <span className="badge">En cours</span>;
}

const shortDay = (day: string) => {
  const { dayMonth, year } = dateParts(day);
  return `${dayMonth} ${year}`;
};
