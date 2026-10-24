import { useEffect } from 'react';
import { authClient } from '../auth-client.js';
import { field, Field, Form } from '../components/Form.js';
import { useSubmit } from '../components/useSubmit.js';
import { CreateOrganisation } from './CreateOrganisation.js';

const ROLE_LABELS: Record<string, string> = { admin: 'Administrateur', membre: 'Membre' };

export function Home() {
  const { data: session } = authClient.useSession();
  const { data: organisations, isPending: listPending } = authClient.useListOrganizations();
  const { data: organisation, isPending: activePending } = authClient.useActiveOrganization();

  // Sans organisation active, on active la première dont l'utilisateur est membre.
  const firstOrganisationId = organisations?.[0]?.id;
  useEffect(() => {
    if (!activePending && !organisation && firstOrganisationId) {
      void authClient.organization.setActive({ organizationId: firstOrganisationId });
    }
  }, [activePending, organisation, firstOrganisationId]);

  if (listPending || activePending) return <p className="loading">Chargement…</p>;
  if (!organisation) {
    return organisations?.length ? <p className="loading">Chargement…</p> : <CreateOrganisation />;
  }

  const me = organisation.members.find((m) => m.userId === session?.user.id);
  const isAdmin = me?.role === 'admin';
  const pendingInvitations = organisation.invitations.filter((i) => i.status === 'pending');

  return (
    <div className="stack">
      <section className="card">
        <h1>{organisation.name}</h1>
        <p>Vous êtes {ROLE_LABELS[me?.role ?? ''] ?? me?.role}.</p>
      </section>

      <section className="card">
        <h2>Membres</h2>
        <ul className="list">
          {organisation.members.map((m) => (
            <li key={m.id}>
              <span>
                {m.user.name} <small>{m.user.email}</small>
              </span>
              <span className="badge">{ROLE_LABELS[m.role] ?? m.role}</span>
            </li>
          ))}
        </ul>
        {pendingInvitations.length > 0 && (
          <>
            <h3>Invitations en attente</h3>
            <ul className="list">
              {pendingInvitations.map((i) => (
                <li key={i.id}>
                  <span>{i.email}</span>
                  <span className="badge">{ROLE_LABELS[i.role] ?? i.role}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {isAdmin && <InviteMember />}
    </div>
  );
}

function InviteMember() {
  const { pending, error, run } = useSubmit();

  async function submit(data: FormData) {
    const role = field(data, 'role') === 'admin' ? 'admin' : 'membre';
    await run(() => authClient.organization.inviteMember({ email: field(data, 'email'), role }));
  }

  return (
    <Form
      title="Inviter un collaborateur"
      submitLabel="Envoyer l'invitation"
      pending={pending}
      error={error}
      onSubmit={submit}
    >
      <Field label="Adresse e-mail" name="email" type="email" />
      <label>
        Rôle
        <select name="role" defaultValue="membre">
          <option value="membre">Membre</option>
          <option value="admin">Administrateur</option>
        </select>
      </label>
    </Form>
  );
}
