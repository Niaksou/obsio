import { useQuery } from '@tanstack/react-query';
import { api, isAdmin } from './api.js';

/** Clés de cache, regroupées pour invalider une branche après une modification. */
export const keys = {
  me: ['me'] as const,
  sites: ['sites'] as const,
  site: (id: string) => ['sites', id] as const,
  buildings: (siteId: string) => ['sites', siteId, 'buildings'] as const,
  floors: (buildingId: string) => ['buildings', buildingId, 'floors'] as const,
  floor: (id: string) => ['floors', id] as const,
  equipment: (floorId: string) => ['floors', floorId, 'equipment'] as const,
};

export function useMe() {
  return useQuery({ queryKey: keys.me, queryFn: api.me });
}

/** Vrai si l'utilisateur est admin de l'organisation active. */
export function useIsAdmin() {
  return isAdmin(useMe().data);
}
