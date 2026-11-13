import { useQuery } from '@tanstack/react-query';
import { api, isManager } from './api.js';

/** Clés de cache, regroupées pour invalider une branche après une modification. */
export const keys = {
  me: ['me'] as const,
  sites: ['sites'] as const,
  site: (id: string) => ['sites', id] as const,
  buildings: (siteId: string) => ['sites', siteId, 'buildings'] as const,
  floors: (buildingId: string) => ['buildings', buildingId, 'floors'] as const,
  floor: (id: string) => ['floors', id] as const,
  equipment: (floorId: string) => ['floors', floorId, 'equipment'] as const,
  zones: (floorId: string) => ['floors', floorId, 'zones'] as const,
  siteEquipment: (siteId: string) => ['sites', siteId, 'equipment'] as const,
  imports: (siteId: string) => ['sites', siteId, 'imports'] as const,
  importDetail: (id: string) => ['imports', id] as const,
  /** Toutes les listes de réserves d'un site, quels que soient les filtres. */
  siteReserves: (siteId: string) => ['sites', siteId, 'reserves'] as const,
  reserves: (siteId: string, filters: object) => ['sites', siteId, 'reserves', filters] as const,
  reserve: (id: string) => ['reserves', id] as const,
  dashboard: (siteId: string) => ['sites', siteId, 'reserves', 'dashboard'] as const,
  /** Échéancier de toute l'organisation ; celui d'un site est une sous-clé. */
  inspections: ['inspections'] as const,
  siteInspections: (siteId: string) => ['inspections', siteId] as const,
  contractors: ['contractors'] as const,
  /** Suivi des électriciens : sous-clé, rafraîchie avec la liste. */
  contractorReserves: ['contractors', 'reserves'] as const,
  myReserves: ['my-reserves'] as const,
  intervention: (token: string) => ['intervention', token] as const,
};

export function useMe() {
  return useQuery({ queryKey: keys.me, queryFn: api.me });
}

/** Vrai si l'utilisateur est admin ou responsable de l'organisation active. */
export function useIsManager() {
  return isManager(useMe().data);
}

/** Rôle dans l'organisation active (null tant qu'il n'est pas connu). */
export function useRole() {
  return useMe().data?.organisation?.role ?? null;
}
