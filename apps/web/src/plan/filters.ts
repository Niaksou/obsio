import { EQUIPMENT_TYPE_LABELS, type Equipment, type EquipmentType } from '@obsio/shared';
import type { ReserveBadge } from './PlanViewer.js';

// Recherche et filtres du plan : quels équipements restent en évidence. Les autres restent
// visibles sur le plan, pâlis, pour garder le repère des lieux.

export type PlanFilter = 'tous' | 'reserves' | 'retard' | 'non_places';

export const PLAN_FILTERS: Record<PlanFilter, string> = {
  tous: 'Tous',
  reserves: 'Réserves',
  retard: 'En retard',
  non_places: 'À placer',
};

export interface PlanQuery {
  search: string;
  filter: PlanFilter;
  type: EquipmentType | null;
}

export const EMPTY_QUERY: PlanQuery = { search: '', filter: 'tous', type: null };

/** « Éclairage  BAES » → « eclairage baes » : sans accents, casse ni espaces doublés. */
export function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Chaque mot cherché figure dans le repère, un autre nom ou le type. */
export function matchesSearch(item: Equipment, search: string) {
  const words = normalize(search).split(' ').filter(Boolean);
  if (words.length === 0) return true;
  const haystack = normalize(
    [item.name, ...item.aliases, EQUIPMENT_TYPE_LABELS[item.type]].join(' '),
  );
  return words.every((word) => haystack.includes(word));
}

/**
 * Rang d'un résultat : repère qui commence par la recherche, puis un mot (repère ou autre nom)
 * qui commence par elle, puis le reste. « presse » donne Presse 3 avant Compresseur.
 */
export function searchRank(item: Equipment, search: string) {
  const query = normalize(search);
  if (!query) return 0;
  if (normalize(item.name).startsWith(query)) return 0;
  const words = [item.name, ...item.aliases].flatMap((name) => normalize(name).split(' '));
  return words.some((word) => word.startsWith(query.split(' ')[0]!)) ? 1 : 2;
}

/** Ordre de la liste : par rang de recherche, puis par repère (TD2 avant TD10). */
export function sortForSearch(items: Equipment[], search: string) {
  return items
    .map((item) => ({ item, rank: searchRank(item, search) }))
    .sort(
      (a, b) => a.rank - b.rank || a.item.name.localeCompare(b.item.name, 'fr', { numeric: true }),
    )
    .map(({ item }) => item);
}

export function matchesFilter(item: Equipment, filter: PlanFilter, badge?: ReserveBadge) {
  switch (filter) {
    case 'reserves':
      return !!badge;
    case 'retard':
      return !!badge?.overdue;
    case 'non_places':
      return !item.position;
    default:
      return true;
  }
}

export const isActive = (query: PlanQuery) =>
  query.search.trim() !== '' || query.filter !== 'tous' || query.type !== null;

/** Équipements retenus, ou null si aucun critère n'est posé (tout est en évidence). */
export function matchingIds(
  items: Equipment[],
  query: PlanQuery,
  badges: Map<string, ReserveBadge>,
): Set<string> | null {
  if (!isActive(query)) return null;
  return new Set(
    items
      .filter(
        (item) =>
          matchesSearch(item, query.search) &&
          matchesFilter(item, query.filter, badges.get(item.id)) &&
          (query.type === null || item.type === query.type),
      )
      .map((item) => item.id),
  );
}

/** Types présents sur l'étage, dans l'ordre de la liste des types. */
export function presentTypes(items: Equipment[]) {
  const present = new Set(items.map((item) => item.type));
  return (Object.keys(EQUIPMENT_TYPE_LABELS) as EquipmentType[]).filter((type) =>
    present.has(type),
  );
}
