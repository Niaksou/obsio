import { useQueryClient } from '@tanstack/react-query';
import { useEffect, type ReactNode } from 'react';
import { authClient } from '../auth-client.js';

/**
 * Garantit une organisation active avant d'afficher la page (l'API en a besoin).
 * Sans organisation active, on active la première dont l'utilisateur est membre.
 */
export function RequireOrganisation({ children }: { children: ReactNode }) {
  const { data: organisations, isPending: listPending } = authClient.useListOrganizations();
  const { data: active, isPending: activePending } = authClient.useActiveOrganization();
  const queryClient = useQueryClient();

  const firstOrganisationId = organisations?.[0]?.id;
  useEffect(() => {
    if (!activePending && !active && firstOrganisationId) {
      void authClient.organization.setActive({ organizationId: firstOrganisationId });
    }
  }, [activePending, active, firstOrganisationId]);

  // Changer d'organisation change toutes les données : on vide le cache.
  const activeId = active?.id;
  useEffect(() => {
    if (activeId) void queryClient.resetQueries();
  }, [activeId, queryClient]);

  if (listPending || activePending || (!active && organisations?.length)) {
    return <p className="loading">Chargement…</p>;
  }
  if (!active) {
    return (
      <div className="card">
        <h1>Aucune organisation</h1>
        <p>
          Votre compte n'est rattaché à aucune organisation. Ouvrez le lien d'invitation reçu par
          e-mail, ou demandez une invitation à l'administrateur de votre entreprise.
        </p>
      </div>
    );
  }
  return children;
}
