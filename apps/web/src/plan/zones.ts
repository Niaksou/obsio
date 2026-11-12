import {
  polygonArea,
  polygonContains,
  zoneShapeSchema,
  type Equipment,
  type PlanPosition,
  type Zone,
} from '@obsio/shared';
import type { Point, Size } from './geometry.js';

// Zones d'un étage : contours nommés (rectangle, pièce en L, toute forme). Un équipement
// appartient à la plus petite zone qui contient son repère (une zone peut en contenir une autre :
// « Atelier » et « Cabine de peinture »).

/** Angles en pixels de l'image vers positions en proportion, ramenées dans le plan. */
export function toPositions(points: Point[], plan: Size): PlanPosition[] {
  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  return points.map((p) => ({ x: clamp(p.x / plan.width), y: clamp(p.y / plan.height) }));
}

/** Ce qui empêche d'enregistrer ce contour, ou null s'il est valable. */
export function shapeError(points: PlanPosition[]): string | null {
  const result = zoneShapeSchema.safeParse(points);
  return result.success ? null : (result.error.issues[0]?.message ?? 'Contour invalide');
}

/** Angle sous lequel un côté est redressé à l'horizontale ou à la verticale. */
const SNAP_DEGREES = 7;

/**
 * Point suivant d'un contour, redressé : côté horizontal ou vertical s'il en est proche (murs
 * d'équerre), et aligné sur le premier angle s'il en passe à moins de `tolerance` pixels de
 * l'image (pour refermer une pièce en L d'équerre).
 */
export function snapPoint(points: Point[], point: Point, tolerance: number): Point {
  const last = points.at(-1);
  if (!last) return point;
  let { x, y } = point;
  const angle = (Math.atan2(Math.abs(y - last.y), Math.abs(x - last.x)) * 180) / Math.PI;
  if (angle < SNAP_DEGREES) y = last.y;
  else if (angle > 90 - SNAP_DEGREES) x = last.x;
  const first = points[0]!;
  if (points.length >= 2) {
    if (x !== last.x && Math.abs(x - first.x) < tolerance) x = first.x;
    if (y !== last.y && Math.abs(y - first.y) < tolerance) y = first.y;
  }
  return { x, y };
}

/** Où poser le nom : l'angle le plus haut, puis le plus à gauche. */
export function labelAnchor(points: PlanPosition[]): PlanPosition {
  return points.reduce((best, p) => (p.y < best.y || (p.y === best.y && p.x < best.x) ? p : best));
}

/** Zone d'une position : la plus petite qui la contient, ou null. */
export function zoneOf(position: PlanPosition | null, zones: Zone[]): Zone | null {
  if (!position) return null;
  let best: { zone: Zone; area: number } | null = null;
  for (const zone of zones) {
    if (!polygonContains(zone.points, position)) continue;
    const area = polygonArea(zone.points);
    if (!best || area < best.area) best = { zone, area };
  }
  return best?.zone ?? null;
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
