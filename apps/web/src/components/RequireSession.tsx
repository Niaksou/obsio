import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { authClient } from '../auth-client.js';
import { TwoFactorSetup } from '../pages/TwoFactorSetup.js';
import { useMe } from '../queries.js';
import { Loading } from './Loading.js';

/**
 * Redirige vers la connexion si aucune session, en gardant la page demandée ; fait activer la
 * double authentification, obligatoire, avant d'afficher la page.
 */
export function RequireSession({ children }: { children: ReactNode }) {
  const { data: session, isPending } = authClient.useSession();
  const location = useLocation();

  if (isPending) return <Loading shape="bar" />;
  if (!session) {
    const redirect = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/connexion?redirect=${redirect}`} replace />;
  }
  if (!session.user.twoFactorEnabled) return <TwoFactorSetup />;
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

/**
 * Pages de pilotage (sites, rapports, échéances, organisation) : un collaborateur, qui ne voit
 * que ses réserves, est renvoyé vers « Mes réserves ». L'API le refuse de toute façon.
 */
export function RequireManager({ children }: { children: ReactNode }) {
  const { data: me, isPending } = useMe();
  if (isPending) return <Loading shape="bar" />;
  if (me?.organisation?.role === 'collaborateur') return <Navigate to="/mes-reserves" replace />;
  return children;
}
