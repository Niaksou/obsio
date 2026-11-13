import { useQueryClient } from '@tanstack/react-query';
import { KeyRound, LogOut } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router';
import { authClient, errorMessage, passkeyCancelled, passkeysSupported } from '../auth-client.js';
import { RequireSession } from '../components/RequireSession.js';
import { consoleKeys, useConsoleSession } from './api.js';
import './console.css';

const iconProps = { size: 18, strokeWidth: 1.5, 'aria-hidden': true } as const;

/** Minutes avant le reverrouillage, mises à jour toutes les 30 secondes. */
function useMinutesLeft(until: string) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return Math.max(0, Math.round((Date.parse(until) - now) / 60_000));
}

/** Un compte client n'a pas de console : la même page qu'une adresse inconnue. */
function NotFound() {
  return (
    <div className="card console-gate">
      <h1>Page introuvable</h1>
      <p>
        <Link to="/">Revenir à l'accueil</Link>
      </p>
    </div>
  );
}

/** Console verrouillée : une connexion par clé d'accès la rouvre pour 15 minutes. */
function LockScreen() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function unlock() {
    setPending(true);
    setError(null);
    const result = await authClient.signIn.passkey();
    setPending(false);
    if (result.error) {
      if (!passkeyCancelled(result.error)) setError(errorMessage(result.error));
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ['console'] });
  }

  return (
    <div className="card console-gate">
      <KeyRound size={24} strokeWidth={1.5} aria-hidden />
      <h1>Console verrouillée</h1>
      <p className="hint">
        Confirmez votre identité avec votre clé d'accès. La console se reverrouille après 15 minutes
        sans activité.
      </p>
      {passkeysSupported() ? (
        <button type="button" onClick={() => void unlock()} disabled={pending}>
          Déverrouiller avec ma clé d'accès
        </button>
      ) : (
        <p className="error">Ce navigateur ne permet pas d'utiliser une clé d'accès.</p>
      )}
      {error && <p className="error">{error}</p>}
      <p className="hint">
        Pas encore de clé d'accès ? Ajoutez-en une dans <Link to="/compte">Mon compte</Link>.
      </p>
    </div>
  );
}

function UnlockedFor({ until }: { until: string }) {
  const minutes = useMinutesLeft(until);
  const queryClient = useQueryClient();
  // Délai écoulé : l'écran de déverrouillage revient sans attendre la prochaine requête.
  useEffect(() => {
    if (minutes === 0) void queryClient.invalidateQueries({ queryKey: consoleKeys.session });
  }, [minutes, queryClient]);
  return (
    <span className="console-lock" title="Prolongé à chaque action dans la console">
      <span className="console-lock-dot" aria-hidden />
      Ouverte · {minutes} min
    </span>
  );
}

function ConsoleShell() {
  const { data: session, isPending } = useConsoleSession();

  if (isPending) return <p className="loading page-message">Chargement…</p>;
  if (!session?.staff) return <NotFound />;
  if (!session.unlockedUntil) return <LockScreen />;

  return (
    <div className="console">
      <header className="console-bar">
        <Link to="/console" className="console-brand">
          Obsio <span>Console</span>
        </Link>
        <nav aria-label="Console">
          <NavLink to="/console" end>
            Clients
          </NavLink>
          <NavLink to="/console/usage">Usage</NavLink>
          <NavLink to="/console/journal">Journal</NavLink>
        </nav>
        <UnlockedFor until={session.unlockedUntil} />
        <Link to="/" className="console-exit">
          <LogOut {...iconProps} />
          <span>Quitter</span>
        </Link>
      </header>
      <main className="console-main">
        <Outlet />
      </main>
    </div>
  );
}

export function ConsoleLayout() {
  return (
    <RequireSession>
      <ConsoleShell />
    </RequireSession>
  );
}
