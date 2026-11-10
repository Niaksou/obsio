import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { authClient, errorMessage } from '../auth-client.js';
import { BackupCodes } from '../components/BackupCodes.js';
import { device } from '../components/device.js';
import { Passkeys } from '../components/Passkeys.js';
import { field, Field, Form } from '../components/Form.js';
import { useSubmit } from '../components/useSubmit.js';
import { PushSettings } from '../push/PushSettings.js';

// Mon compte : passkeys, notifications, mot de passe, sessions ouvertes et codes de secours de la double
// authentification.

export function AccountPage() {
  const { data: session } = authClient.useSession();
  if (!session) return <p className="loading">Chargement…</p>;

  return (
    <div className="stack">
      <section className="card">
        <h1>Mon compte</h1>
        <p>
          {session.user.name} <small>{session.user.email}</small>
        </p>
      </section>
      <Passkeys />
      <PushSettings />
      <ChangePassword />
      <Sessions currentToken={session.session.token} />
      <RegenerateBackupCodes />
    </div>
  );
}

function ChangePassword() {
  const { pending, error, run } = useSubmit();
  const [done, setDone] = useState(false);
  const queryClient = useQueryClient();

  async function submit(data: FormData) {
    setDone(false);
    // Les autres sessions sont fermées : un mot de passe changé après un vol coupe l'accès.
    const ok = await run(() =>
      authClient.changePassword({
        currentPassword: field(data, 'currentPassword'),
        newPassword: field(data, 'newPassword'),
        revokeOtherSessions: true,
      }),
    );
    if (ok) {
      setDone(true);
      void queryClient.invalidateQueries({ queryKey: ['sessions'] });
    }
  }

  return (
    <Form
      title="Mot de passe"
      submitLabel="Changer le mot de passe"
      pending={pending}
      error={error}
      onSubmit={submit}
    >
      <Field
        label="Mot de passe actuel"
        name="currentPassword"
        type="password"
        autoComplete="current-password"
      />
      <Field
        label="Nouveau mot de passe (12 caractères au moins)"
        name="newPassword"
        type="password"
        autoComplete="new-password"
        minLength={12}
      />
      {done && <p role="status">Mot de passe changé ; vos autres sessions sont fermées.</p>}
    </Form>
  );
}

const dateTime = (value: Date | string) =>
  new Date(value).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });

function Sessions({ currentToken }: { currentToken: string }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const { data: sessions } = useQuery({
    queryKey: ['sessions'],
    queryFn: async () => {
      const { data, error } = await authClient.listSessions();
      if (error) throw new Error(errorMessage(error) ?? undefined);
      return data;
    },
  });

  async function revoke(action: () => Promise<{ error: { code?: string } | null }>) {
    setError(null);
    const { error } = await action();
    setError(errorMessage(error));
    void queryClient.invalidateQueries({ queryKey: ['sessions'] });
  }

  const others = sessions?.filter((s) => s.token !== currentToken) ?? [];
  return (
    <section className="card">
      <h2>Sessions ouvertes</h2>
      <p className="hint">
        Une session se ferme après 2 heures sans activité, et au plus tard 12 heures après la
        connexion. Fermez celles que vous ne reconnaissez pas, puis changez votre mot de passe.
      </p>
      {!sessions ? (
        <p className="loading">Chargement…</p>
      ) : (
        <ul className="list">
          {sessions.map((s) => (
            <li key={s.id}>
              <span>
                {device(s.userAgent)} <small>{s.ipAddress}</small>
                <br />
                <small>
                  Connexion le {dateTime(s.createdAt)}, dernière activité le {dateTime(s.updatedAt)}
                </small>
              </span>
              {s.token === currentToken ? (
                <span className="badge">Cette session</span>
              ) : (
                <button
                  type="button"
                  className="link"
                  onClick={() => void revoke(() => authClient.revokeSession({ token: s.token }))}
                >
                  Fermer
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {others.length > 1 && (
        <button type="button" onClick={() => void revoke(() => authClient.revokeOtherSessions())}>
          Fermer toutes les autres sessions
        </button>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

function RegenerateBackupCodes() {
  const { pending, error, run } = useSubmit();
  const [codes, setCodes] = useState<string[] | null>(null);

  async function submit(data: FormData) {
    await run(async () => {
      const result = await authClient.twoFactor.generateBackupCodes({
        password: field(data, 'password'),
      });
      if (result.data) setCodes(result.data.backupCodes);
      return result;
    });
  }

  return (
    <Form
      title="Codes de secours"
      submitLabel="Générer de nouveaux codes"
      pending={pending}
      error={error}
      onSubmit={submit}
    >
      <p>
        La double authentification est activée. Si vous avez utilisé ou égaré vos codes de secours,
        générez-en de nouveaux : les anciens ne fonctionneront plus.
      </p>
      {codes && <BackupCodes codes={codes} />}
      <Field label="Mot de passe" name="password" type="password" autoComplete="current-password" />
    </Form>
  );
}
