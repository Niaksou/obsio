import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent, type ReactNode } from 'react';
import { authClient, errorMessage } from '../auth-client.js';
import { BackupCodes } from '../components/BackupCodes.js';
import { device } from '../components/device.js';
import { field, Field } from '../components/Form.js';
import { initials } from '../components/Layout.js';
import { Passkeys } from '../components/Passkeys.js';
import { Setting, SettingItem, SettingItems, SettingsGroup } from '../components/Settings.js';
import { useSubmit } from '../components/useSubmit.js';
import { PushSettings } from '../push/PushSettings.js';

// Mon compte : connexion (clés d'accès, mot de passe, codes de secours), notifications de cet
// appareil et sessions ouvertes. Une page de réglages en lignes ; les formulaires sont repliés.

export function AccountPage() {
  const { data: session } = authClient.useSession();
  if (!session) return <p className="loading">Chargement…</p>;

  return (
    <div className="account">
      <header className="account-head">
        <span className="avatar avatar-large" aria-hidden>
          {initials(session.user.name)}
        </span>
        <div>
          <h1>{session.user.name}</h1>
          <p>{session.user.email}</p>
        </div>
      </header>
      <SettingsGroup title="Connexion">
        <Passkeys />
        <ChangePassword />
        <RegenerateBackupCodes />
      </SettingsGroup>
      <SettingsGroup title="Notifications">
        <PushSettings />
      </SettingsGroup>
      <Sessions currentToken={session.session.token} />
    </div>
  );
}

/** Formulaire déplié sous un réglage : champs, erreur, Enregistrer et Annuler. */
function InlineForm({
  submitLabel,
  pending,
  error,
  onSubmit,
  onCancel,
  children,
}: {
  submitLabel: string;
  pending: boolean;
  error: string | null;
  onSubmit: (data: FormData) => void;
  onCancel: () => void;
  children: ReactNode;
}) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(new FormData(event.currentTarget));
  }
  return (
    <form className="setting-form" onSubmit={handleSubmit}>
      {children}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="actions">
        <button type="submit" disabled={pending}>
          {pending ? 'Veuillez patienter…' : submitLabel}
        </button>
        <button type="button" className="quiet" onClick={onCancel}>
          Annuler
        </button>
      </div>
    </form>
  );
}

function ChangePassword() {
  const { pending, error, run } = useSubmit();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const queryClient = useQueryClient();

  async function submit(data: FormData) {
    // Les autres sessions sont fermées : un mot de passe changé après un vol coupe l'accès.
    const ok = await run(() =>
      authClient.changePassword({
        currentPassword: field(data, 'currentPassword'),
        newPassword: field(data, 'newPassword'),
        revokeOtherSessions: true,
      }),
    );
    if (ok) {
      setOpen(false);
      setDone(true);
      void queryClient.invalidateQueries({ queryKey: ['sessions'] });
    }
  }

  return (
    <Setting
      title="Mot de passe"
      status={
        done ? (
          <span role="status">Changé ; vos autres sessions sont fermées.</span>
        ) : (
          'Avec le code à 6 chiffres de votre application.'
        )
      }
      action={
        !open && (
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setDone(false);
              setOpen(true);
            }}
          >
            Modifier
          </button>
        )
      }
    >
      {open && (
        <InlineForm
          submitLabel="Changer le mot de passe"
          pending={pending}
          error={error}
          onSubmit={submit}
          onCancel={() => setOpen(false)}
        >
          <Field
            label="Mot de passe actuel"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
          />
          <Field
            label="Nouveau mot de passe"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            minLength={12}
            hint="12 caractères au moins."
          />
        </InlineForm>
      )}
    </Setting>
  );
}

function RegenerateBackupCodes() {
  const { pending, error, run } = useSubmit();
  const [open, setOpen] = useState(false);
  const [codes, setCodes] = useState<string[] | null>(null);

  async function submit(data: FormData) {
    const ok = await run(async () => {
      const result = await authClient.twoFactor.generateBackupCodes({
        password: field(data, 'password'),
      });
      if (result.data) setCodes(result.data.backupCodes);
      return result;
    });
    if (ok) setOpen(false);
  }

  return (
    <Setting
      title="Codes de secours"
      status="Double authentification activée. Les codes servent sans votre téléphone."
      action={
        !open && (
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setCodes(null);
              setOpen(true);
            }}
          >
            Régénérer
          </button>
        )
      }
    >
      {open && (
        <InlineForm
          submitLabel="Générer de nouveaux codes"
          pending={pending}
          error={error}
          onSubmit={submit}
          onCancel={() => setOpen(false)}
        >
          <p className="hint">Les anciens codes ne fonctionneront plus.</p>
          <Field
            label="Mot de passe"
            name="password"
            type="password"
            autoComplete="current-password"
          />
        </InlineForm>
      )}
      {codes && <BackupCodes codes={codes} />}
    </Setting>
  );
}

const dateTime = (value: Date | string) =>
  new Date(value).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });

/** Sessions listées d'emblée ; les suivantes sur demande. */
const SESSIONS_SHOWN = 4;

function Sessions({ currentToken }: { currentToken: string }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
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

  // Cette session d'abord, puis les autres de la plus récente à la plus ancienne.
  const sorted = [...(sessions ?? [])].sort((a, b) =>
    a.token === currentToken
      ? -1
      : b.token === currentToken
        ? 1
        : new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
  const others = sorted.length - 1;
  const shown = showAll ? sorted : sorted.slice(0, SESSIONS_SHOWN);

  return (
    <SettingsGroup
      title="Sessions"
      description="Fermées après 2 h sans activité, 12 h au plus. Une session inconnue : fermez-la et changez de mot de passe."
    >
      <Setting
        tour="account-sessions"
        title={
          !sessions
            ? 'Sessions ouvertes'
            : `${sessions.length} session${sessions.length > 1 ? 's' : ''} ouverte${sessions.length > 1 ? 's' : ''}`
        }
        action={
          others > 1 && (
            <button
              type="button"
              className="secondary"
              onClick={() => void revoke(() => authClient.revokeOtherSessions())}
            >
              Fermer les autres
            </button>
          )
        }
      >
        {!sessions ? (
          <p className="loading">Chargement…</p>
        ) : (
          <SettingItems>
            {shown.map((s) => (
              <SettingItem
                key={s.id}
                name={device(s.userAgent)}
                detail={
                  <>
                    Active le {dateTime(s.updatedAt)}
                    {s.ipAddress && <> · {s.ipAddress}</>}
                  </>
                }
                action={
                  s.token === currentToken ? (
                    <span className="badge">Cet appareil</span>
                  ) : (
                    <button
                      type="button"
                      className="quiet"
                      onClick={() =>
                        void revoke(() => authClient.revokeSession({ token: s.token }))
                      }
                    >
                      Fermer
                    </button>
                  )
                }
              />
            ))}
          </SettingItems>
        )}
        {shown.length < sorted.length && (
          <button type="button" className="link" onClick={() => setShowAll(true)}>
            Afficher les {sorted.length - shown.length} autres
          </button>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </Setting>
    </SettingsGroup>
  );
}
