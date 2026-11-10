import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { authClient, errorMessage, passkeyCancelled, passkeysSupported } from '../auth-client.js';
import { ConfirmButton } from './ConfirmButton.js';
import { device } from './device.js';

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

/** Section « Connexion par Face ID » de la page Mon compte. */
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

  return (
    <section className="card" data-tour="account-passkeys">
      <h2>Connexion par Face ID</h2>
      <p className="hint">
        Connectez-vous d'un geste (Face ID, empreinte ou code de l'appareil), sans mot de passe ni
        code à 6 chiffres.
      </p>
      {passkeys && passkeys.length > 0 && (
        <ul className="list">
          {passkeys.map((p) => (
            <li key={p.id}>
              <span>
                {p.name || 'Passkey'}
                {p.createdAt && <small> ajoutée le {date(p.createdAt)}</small>}
              </span>
              <ConfirmButton
                label="Retirer"
                confirmLabel="Retirer cette passkey"
                onConfirm={() => void remove(p.id)}
              />
            </li>
          ))}
        </ul>
      )}
      {passkeysSupported() ? (
        <button type="button" disabled={pending} onClick={() => void add()}>
          {pending ? 'Veuillez patienter…' : 'Activer sur cet appareil'}
        </button>
      ) : (
        <p className="hint">Ce navigateur ne permet pas la connexion par Face ID.</p>
      )}
      {(error ?? removeError) && (
        <p className="error" role="alert">
          {error ?? removeError}
        </p>
      )}
    </section>
  );
}

const DISMISSED_KEY = 'obsio-passkey-suggestion-masquee';

/** Proposition d'activer Face ID, sur l'accueil, tant que le compte n'a aucune passkey. */
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
      <p>Activez Face ID (ou l'empreinte) pour vous connecter d'un geste sur cet appareil.</p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="actions">
        <button type="button" disabled={pending} onClick={() => void add()}>
          {pending ? 'Veuillez patienter…' : 'Activer Face ID'}
        </button>
        <button type="button" className="link" onClick={dismiss}>
          Plus tard
        </button>
      </div>
    </section>
  );
}
