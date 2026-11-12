import type { Equipment, PlanBounds, PlanPosition, Zone } from '@obsio/shared';
import type { Point, Size } from './geometry.js';

// Zones d'un étage : rectangles nommés. Un équipement appartient à la plus petite zone qui
// contient son repère (une zone peut en contenir une autre : « Atelier » et « Cabine de peinture »).

/** Rectangle défini par deux coins opposés, en pixels de l'image, ramené en proportions. */
export function boundsFromPoints(a: Point, b: Point, plan: Size): PlanBounds {
  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  const x1 = clamp(Math.min(a.x, b.x) / plan.width);
  const y1 = clamp(Math.min(a.y, b.y) / plan.height);
  const x2 = clamp(Math.max(a.x, b.x) / plan.width);
  const y2 = clamp(Math.max(a.y, b.y) / plan.height);
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

/** Zone assez grande pour être enregistrée (l'API refuse moins d'un demi-pour-cent). */
export const isUsable = (bounds: PlanBounds) => bounds.width >= 0.005 && bounds.height >= 0.005;

export const contains = (bounds: PlanBounds, position: PlanPosition) =>
  position.x >= bounds.x &&
  position.x <= bounds.x + bounds.width &&
  position.y >= bounds.y &&
  position.y <= bounds.y + bounds.height;

/** Zone d'une position : la plus petite qui la contient, ou null. */
export function zoneOf(position: PlanPosition | null, zones: Zone[]): Zone | null {
  if (!position) return null;
  let best: Zone | null = null;
  for (const zone of zones) {
    if (!contains(zone.bounds, position)) continue;
    const area = zone.bounds.width * zone.bounds.height;
    if (!best || area < best.bounds.width * best.bounds.height) best = zone;
  }
  return best;
}

export interface ZoneGroup {
  /** null : équipements hors zone ou non placés. */
  zone: Zone | null;
  items: Equipment[];
}

/** Équipements regroupés par zone, dans l'ordre des noms ; « hors zone » en dernier. */
export function groupByZone(items: Equipment[], zones: Zone[]): ZoneGroup[] {
  const sortedZones = [...zones].sort((a, b) =>
    a.name.localeCompare(b.name, 'fr', { numeric: true }),
  );
  const groups = new Map<string | null, Equipment[]>(sortedZones.map((zone) => [zone.id, []]));
  groups.set(null, []);
  for (const item of items) groups.get(zoneOf(item.position, zones)?.id ?? null)!.push(item);
  return [
    ...sortedZones.map((zone) => ({ zone, items: groups.get(zone.id)! })),
    { zone: null, items: groups.get(null)! },
  ];
}
