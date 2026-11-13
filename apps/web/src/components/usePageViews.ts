import { pagePattern } from '@obsio/shared';
import { useEffect } from 'react';
import { z } from 'zod';
import { request } from '../api.js';
import { authClient } from '../auth-client.js';

/**
 * Compte la page affichée pour la console Obsio : modèle de page seulement (« /etages/:id »),
 * sans utilisateur ni cookie de mesure. Hors ligne ou en échec, la vue n'est simplement pas comptée.
 */
export function usePageViews(pathname: string) {
  // Comptée pour l'organisation active : on attend qu'elle soit choisie.
  const organisationId = authClient.useActiveOrganization().data?.id;
  useEffect(() => {
    const path = pagePattern(pathname);
    if (!organisationId || !path || !navigator.onLine) return;
    request(z.null(), 'POST', '/api/usage/page', { path }).catch(() => undefined);
  }, [pathname, organisationId]);
}
