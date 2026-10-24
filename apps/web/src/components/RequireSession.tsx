import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { authClient } from '../auth-client.js';

/** Redirige vers la connexion si aucune session, en gardant la page demandée. */
export function RequireSession({ children }: { children: ReactNode }) {
  const { data: session, isPending } = authClient.useSession();
  const location = useLocation();

  if (isPending) return <p className="loading">Chargement…</p>;
  if (!session) {
    const redirect = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/connexion?redirect=${redirect}`} replace />;
  }
  return children;
}

/** Vrai si la page demandée est une invitation : seul cas où l'inscription est proposée. */
export function isInvitationPath(path: string): boolean {
  return path.startsWith('/invitations/');
}

/** Destination après connexion : uniquement un chemin interne, jamais une URL externe. */
export function safeRedirect(value: string | null): string {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/';
}
