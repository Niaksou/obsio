import type { Contractor, ContractorReserve } from '@obsio/shared';
import { useQuery } from '@tanstack/react-query';
import {
  assignableRoles,
  canManagePerson,
  isManager,
  MEMBER_ROLES,
  memberRoleSchema,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  type MemberRole,
} from '@obsio/shared';
import { Mail, UserPlus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { api } from '../api.js';
import { authClient } from '../auth-client.js';
import { field } from '../components/Form.js';
import { Setting, SettingItems, SettingsGroup } from '../components/Settings.js';
import { useSubmit } from '../components/useSubmit.js';
import { dateParts } from '../inspections/describe.js';
import { keys } from '../queries.js';
import { ContractorForm } from '../reserves/ContractorForm.js';
import { summary } from '../reserves/contractors.js';
import { Loading } from '../components/Loading.js';
import { ConfirmButton } from '../components/ConfirmButton.js';
import { initials } from '../components/Layout.js';
import { plural } from '../reserves/status.js';

// Organisation : les membres (avec un compte) et les électriciens externes (sans compte,
// un lien par e-mail), avec le suivi de ce qui leur est confié.

export function Home() {
  const { data: session } = authClient.useSession();
  const { data: organisation } = authClient.useActiveOrganization();
  if (!organisation) return <Loading shape="detail" />;

  const me = organisation.members.find((m) => m.userId === session?.user.id);
  const myRole = asRole(me?.role);

  return (
    <div className="settings-page">
      <header className="settings-head">
        <div>
          <h1>{organisation.name}</h1>
          {myRole && <p>Vous êtes {ROLE_LABELS[myRole].toLowerCase()}</p>}
        </div>
      </header>
      {myRole && (
        <People
          myRole={myRole}
          myUserId={session?.user.id ?? ''}
          members={organisation.members}
          invitations={organisation.invitations.filter((i) => i.status === 'pending')}
        />
      )}
      <Contractors isManager={isManager(myRole)} />
    </div>
  );
}

type Organisation = NonNullable<ReturnType<typeof authClient.useActiveOrganization>['data']>;
type Member = Organisation['members'][number] & { founder?: boolean };

const asRole = (value: unknown): MemberRole | null => {
  const parsed = memberRoleSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
};

/** Les admins d'abord, puis les responsables et les collaborateurs ; par nom dans chaque rôle. */
const roleOrder = (role: MemberRole | null) => (role ? MEMBER_ROLES.indexOf(role) : 9);

function People({
  myRole,
  myUserId,
  members,
  invitations,
}: {
  myRole: MemberRole;
  myUserId: string;
  members: Member[];
  invitations: Organisation['invitations'];
}) {
  const [inviting, setInviting] = useState(false);
  const canInvite = assignableRoles(myRole).length > 0;
  const sorted = [...members].sort(
    (a, b) =>
      Number(Boolean(b.founder)) - Number(Boolean(a.founder)) ||
      roleOrder(asRole(a.role)) - roleOrder(asRole(b.role)) ||
      a.user.name.localeCompare(b.user.name, 'fr'),
  );
  return (
    <SettingsGroup
      title="Personnes"
      description="Avec un compte Obsio. L’admin gère tout le monde, le responsable les collaborateurs."
    >
      <Setting
        title={`${members.length} personne${members.length > 1 ? 's' : ''}`}
        status={
          invitations.length > 0
            ? plural(invitations.length, 'invitation') + ' en attente'
            : undefined
        }
        action={
          canInvite &&
          !inviting && (
            <button type="button" className="secondary" onClick={() => setInviting(true)}>
              <UserPlus size={16} strokeWidth={1.5} aria-hidden />
              Inviter
            </button>
          )
        }
      >
        {inviting && <InvitePerson myRole={myRole} onDone={() => setInviting(false)} />}
        <ul className="people">
          {sorted.map((m) => (
            <PersonRow key={m.id} member={m} myRole={myRole} self={m.userId === myUserId} />
          ))}
          {invitations.map((i) => (
            <InvitationRow key={i.id} invitation={i} myRole={myRole} />
          ))}
        </ul>
      </Setting>
    </SettingsGroup>
  );
}

function RoleTag({ role, founder }: { role: MemberRole | null; founder?: boolean }) {
  return (
    <span className="person-role">
      {role ? ROLE_LABELS[role] : 'Rôle inconnu'}
      {founder && <span className="person-founder">fondateur</span>}
    </span>
  );
}

function PersonRow({
  member,
  myRole,
  self,
}: {
  member: Member;
  myRole: MemberRole;
  self: boolean;
}) {
  const role = asRole(member.role);
  const [editing, setEditing] = useState(false);
  // On ne se modifie pas soi-même ici : pas de risque de se retirer ses propres droits.
  const manageable =
    !self && role !== null && canManagePerson(myRole, { role, founder: member.founder });
  return (
    <li className={editing ? 'person editing' : 'person'}>
      <span className="avatar" aria-hidden>
        {initials(member.user.name)}
      </span>
      <span className="person-text">
        <span className="person-name">
          {member.user.name}
          {self && <small> · vous</small>}
        </span>
        <small>{member.user.email}</small>
      </span>
      <RoleTag role={role} founder={member.founder} />
      {manageable && !editing && (
        <button type="button" className="quiet compact" onClick={() => setEditing(true)}>
          Modifier
        </button>
      )}
      {editing && role && (
        <EditPerson member={member} role={role} myRole={myRole} onDone={() => setEditing(false)} />
      )}
    </li>
  );
}

function EditPerson({
  member,
  role,
  myRole,
  onDone,
}: {
  member: Member;
  role: MemberRole;
  myRole: MemberRole;
  onDone: () => void;
}) {
  const { pending, error, run } = useSubmit();
  const roles = assignableRoles(myRole);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = asRole(field(new FormData(event.currentTarget), 'role'));
    if (!next || next === role) return onDone();
    const ok = await run(() =>
      authClient.organization.updateMemberRole({ memberId: member.id, role: next }),
    );
    if (ok) onDone();
  }

  async function removeMember() {
    const ok = await run(() =>
      authClient.organization.removeMember({ memberIdOrEmail: member.id }),
    );
    if (ok) onDone();
  }

  return (
    <form className="person-form" onSubmit={(event) => void save(event)}>
      <RolePicker roles={roles} defaultValue={role} />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="person-form-actions">
        <button type="submit" disabled={pending}>
          Enregistrer
        </button>
        <button type="button" className="quiet" onClick={onDone}>
          Annuler
        </button>
        <span className="person-remove">
          <ConfirmButton
            label="Retirer de l’organisation"
            confirmLabel={`Retirer ${member.user.name}`}
            disabled={pending}
            onConfirm={() => void removeMember()}
          />
        </span>
      </div>
      <p className="hint">
        Retirée, la personne perd l’accès tout de suite ; ses preuves et son historique restent
      </p>
    </form>
  );
}

function InvitationRow({
  invitation,
  myRole,
}: {
  invitation: Organisation['invitations'][number];
  myRole: MemberRole;
}) {
  const role = asRole(invitation.role);
  const { pending, error, run } = useSubmit();
  const manageable = role !== null && canManagePerson(myRole, { role });
  return (
    <li className="person pending">
      <span className="avatar avatar-pending" aria-hidden>
        <Mail size={16} strokeWidth={1.5} />
      </span>
      <span className="person-text">
        <span className="person-name">{invitation.email}</span>
        <small>Invitation envoyée, pas encore acceptée</small>
      </span>
      <RoleTag role={role} />
      {manageable && (
        <ConfirmButton
          label="Annuler"
          confirmLabel="Annuler l’invitation"
          disabled={pending}
          onConfirm={() =>
            void run(() =>
              authClient.organization.cancelInvitation({ invitationId: invitation.id }),
            )
          }
        />
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </li>
  );
}

/** Choix du rôle : boutons radio, chacun avec ce qu'il permet. */
function RolePicker({ roles, defaultValue }: { roles: MemberRole[]; defaultValue: MemberRole }) {
  return (
    <fieldset className="role-picker">
      <legend>Rôle</legend>
      {roles.map((role) => (
        <label key={role}>
          <input type="radio" name="role" value={role} defaultChecked={role === defaultValue} />
          <span>
            {ROLE_LABELS[role]}
            <small>{ROLE_DESCRIPTIONS[role]}</small>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

function InvitePerson({ myRole, onDone }: { myRole: MemberRole; onDone: () => void }) {
  const { pending, error, run } = useSubmit();
  const roles = assignableRoles(myRole);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const role = asRole(field(data, 'role')) ?? 'collaborateur';
    const ok = await run(() =>
      authClient.organization.inviteMember({ email: field(data, 'email'), role }),
    );
    if (ok) onDone();
  }

  return (
    <form className="setting-form" onSubmit={(event) => void submit(event)}>
      <label>
        Adresse e-mail
        <input name="email" type="email" required autoComplete="off" autoFocus />
      </label>
      {roles.length > 1 ? (
        <RolePicker roles={roles} defaultValue="collaborateur" />
      ) : (
        <>
          <input type="hidden" name="role" value={roles[0]} />
          <p className="hint">
            Invité comme {ROLE_LABELS[roles[0]!].toLowerCase()} :{' '}
            {ROLE_DESCRIPTIONS[roles[0]!].toLowerCase()}
          </p>
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="actions">
        <button type="submit" disabled={pending}>
          {pending ? 'Envoi…' : 'Envoyer l’invitation'}
        </button>
        <button type="button" className="quiet" onClick={onDone}>
          Annuler
        </button>
      </div>
    </form>
  );
}

function Contractors({ isManager }: { isManager: boolean }) {
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
          isManager={isManager}
        />
      ))}
      {contractors.data?.length === 0 && !isManager && (
        <Setting title="Aucun électricien" status="L’admin les ajoute en confiant une réserve." />
      )}
      {isManager && (
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
  isManager,
}: {
  contractor: Contractor;
  reserves: ContractorReserve[];
  isManager: boolean;
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
        isManager &&
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
