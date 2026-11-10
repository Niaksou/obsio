import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { authClient, errorMessage, passkeyCancelled, passkeysSupported } from '../auth-client.js';
import { ConfirmButton } from './ConfirmButton.js';
import { device } from './device.js';
import { Setting, SettingItem, SettingItems } from './Settings.js';

const PASSKEYS_KEY = ['passkeys'];

export function usePasskeys() {
  return useQuery({
    queryKey: PASSKEYS_KEY,
    queryFn: async () => {
      const { data, error } = await authClient.passkey.listUserPasskeys();
      if (error) throw new Error(errorMessage(error) ?? undefined);
      return data;
    },
  });
}

/** Ajoute une passkey pour cet appareil ; renvoie un message d'erreur, ou null. */
export function useAddPasskey() {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setPending(true);
    setError(null);
    const result = await authClient.passkey.addPasskey({ name: device(navigator.userAgent) });
    setPending(false);
    if (result.error && !passkeyCancelled(result.error)) setError(errorMessage(result.error));
    void queryClient.invalidateQueries({ queryKey: PASSKEYS_KEY });
    return !result.error;
  }

  return { add, pending, error };
}

const date = (value: Date | string) => new Date(value).toLocaleDateString('fr-FR');

/** Réglage « Clés d'accès » de la page Mon compte. */
export function Passkeys() {
  const queryClient = useQueryClient();
  const { data: passkeys } = usePasskeys();
  const { add, pending, error } = useAddPasskey();
  const [removeError, setRemoveError] = useState<string | null>(null);

  async function remove(id: string) {
    setRemoveError(null);
    const { error } = await authClient.passkey.deletePasskey({ id });
    setRemoveError(errorMessage(error));
    void queryClient.invalidateQueries({ queryKey: PASSKEYS_KEY });
  }

  const count = passkeys?.length ?? 0;
  return (
    <Setting
      tour="account-passkeys"
      title="Clés d’accès"
      status={
        count === 0
          ? 'Connexion d’un geste, sans mot de passe ni code.'
          : `${count} clé${count > 1 ? 's' : ''} : connexion d’un geste, sans mot de passe.`
      }
      action={
        passkeysSupported() ? (
          <button
            type="button"
            className={count > 0 ? 'secondary' : undefined}
            disabled={pending}
            onClick={() => void add()}
          >
            {pending ? 'Veuillez patienter…' : count > 0 ? 'Ajouter' : 'Créer une clé'}
          </button>
        ) : undefined
      }
    >
      {!passkeysSupported() && <p className="hint">Ce navigateur ne gère pas les clés d’accès.</p>}
      {count > 0 && (
        <SettingItems>
          {passkeys!.map((p) => (
            <SettingItem
              key={p.id}
              name={p.name || 'Clé d’accès'}
              detail={p.createdAt ? `Ajoutée le ${date(p.createdAt)}` : undefined}
              action={
                <ConfirmButton
                  label="Retirer"
                  confirmLabel="Retirer"
                  onConfirm={() => void remove(p.id)}
                />
              }
            />
          ))}
        </SettingItems>
      )}
      {(error ?? removeError) && (
        <p className="error" role="alert">
          {error ?? removeError}
        </p>
      )}
    </Setting>
  );
}

const DISMISSED_KEY = 'obsio-passkey-suggestion-masquee';

/** Proposition de créer une clé d'accès, sur l'accueil, tant que le compte n'a aucune passkey. */
export function PasskeySuggestion() {
  const { data: passkeys } = usePasskeys();
  const { add, pending, error } = useAddPasskey();
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISSED_KEY) === '1');

  if (dismissed || !passkeysSupported() || !passkeys || passkeys.length > 0) return null;

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, '1');
    setDismissed(true);
  }

  return (
    <section className="card suggestion">
      <h2>Connexion plus rapide</h2>
      <p>Créez une clé d’accès pour vous connecter d’un geste, sans mot de passe.</p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="actions">
        <button type="button" disabled={pending} onClick={() => void add()}>
          {pending ? 'Veuillez patienter…' : 'Créer une clé d’accès'}
        </button>
        <button type="button" className="link" onClick={dismiss}>
          Plus tard
        </button>
      </div>
    </section>
  );
}
