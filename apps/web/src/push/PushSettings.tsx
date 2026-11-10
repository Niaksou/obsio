import { useEffect, useState } from 'react';
import { Setting } from '../components/Settings.js';
import { disablePush, enablePush, isHandheld, pushState, type PushState } from './push.js';

function usePush() {
  const [state, setState] = useState<PushState | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void pushState()
      .then(setState)
      .catch(() => setState('unsupported'));
  }, []);

  async function run(action: () => Promise<PushState>) {
    setPending(true);
    setError(null);
    try {
      setState(await action());
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message
          ? cause.message
          : 'Impossible d’activer les notifications. Réessayez.',
      );
    } finally {
      setPending(false);
    }
  }

  return {
    state,
    pending,
    error,
    enable: () => run(enablePush),
    disable: () =>
      run(async () => {
        await disablePush();
        return 'off';
      }),
  };
}

/** Marche à suivre sur iPhone : Safari n'envoie de notifications qu'à une application installée. */
function InstallFirst() {
  return (
    <p className="hint">
      Sur iPhone, ajoutez d’abord Obsio à l’écran d’accueil : bouton Partager de Safari, puis « Sur
      l’écran d’accueil ». Ouvrez ensuite Obsio depuis son icône pour activer les notifications.
    </p>
  );
}

/** Réglage « Notifications » de la page Mon compte. */
export function PushSettings() {
  const { state, pending, error, enable, disable } = usePush();
  const status =
    state === 'on'
      ? 'Activées : prévenu quand une réserve vous est confiée.'
      : state === 'denied'
        ? 'Bloquées dans les réglages du navigateur : autorisez-les, puis revenez ici.'
        : state === 'unsupported'
          ? 'Ce navigateur ne permet pas les notifications.'
          : 'Prévenu quand une réserve vous est confiée, en plus de l’e-mail.';
  return (
    <Setting
      tour="account-push"
      title={`Sur ${isHandheld() ? 'ce téléphone' : 'cet ordinateur'}`}
      status={state ? status : 'Chargement…'}
      action={
        state === 'off' ? (
          <button type="button" disabled={pending} onClick={() => void enable()}>
            {pending ? 'Veuillez patienter…' : 'Activer'}
          </button>
        ) : state === 'on' ? (
          <button
            type="button"
            className="secondary"
            disabled={pending}
            onClick={() => void disable()}
          >
            Désactiver
          </button>
        ) : undefined
      }
    >
      {state === 'install-first' && <InstallFirst />}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </Setting>
  );
}

const DISMISSED_KEY = 'obsio-notifications-suggestion-masquee';

/** Proposition sur « Mes réserves », tant que l'appareil n'est pas abonné. */
export function PushSuggestion() {
  const { state, pending, error, enable } = usePush();
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISSED_KEY) === '1');
  if (dismissed || (state !== 'off' && state !== 'install-first')) return null;

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, '1');
    setDismissed(true);
  }

  return (
    <section className="card suggestion" data-tour="push-suggestion">
      <h2>Être prévenu sur {isHandheld() ? 'ce téléphone' : 'cet ordinateur'}</h2>
      {state === 'install-first' ? (
        <InstallFirst />
      ) : (
        <p>Recevez une notification dès qu’une réserve vous est confiée.</p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="actions">
        {state === 'off' && (
          <button type="button" disabled={pending} onClick={() => void enable()}>
            {pending ? 'Veuillez patienter…' : 'Activer les notifications'}
          </button>
        )}
        <button type="button" className="link" onClick={dismiss}>
          {state === 'off' ? 'Plus tard' : 'Compris'}
        </button>
      </div>
    </section>
  );
}
