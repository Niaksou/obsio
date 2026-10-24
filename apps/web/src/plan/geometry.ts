import type { PlanPosition } from '@obsio/shared';

// Géométrie de la visionneuse : l'image du plan est affichée à l'échelle `scale`, son coin
// supérieur gauche placé en (x, y) dans le canevas. Les équipements sont stockés en proportion
// de l'image (0 à 1), indépendamment de sa résolution.

export interface View {
  scale: number;
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Zoom maximal par rapport à la vue d'ensemble, et marge autour du plan ajusté. */
export const MAX_ZOOM = 12;
const FIT_MARGIN = 24;

/** Vue qui montre tout le plan, centré dans le canevas. */
export function fitView(plan: Size, canvas: Size): View {
  const scale = Math.max(
    0.01,
    Math.min(
      (canvas.width - 2 * FIT_MARGIN) / plan.width,
      (canvas.height - 2 * FIT_MARGIN) / plan.height,
    ),
  );
  return {
    scale,
    x: (canvas.width - plan.width * scale) / 2,
    y: (canvas.height - plan.height * scale) / 2,
  };
}

/** Zoome d'un facteur en gardant fixe le point visé (curseur ou centre du pincement). */
export function zoomAt(
  view: View,
  anchor: Point,
  factor: number,
  limits: { min: number; max: number },
): View {
  const scale = Math.min(limits.max, Math.max(limits.min, view.scale * factor));
  const ratio = scale / view.scale;
  return {
    scale,
    x: anchor.x - (anchor.x - view.x) * ratio,
    y: anchor.y - (anchor.y - view.y) * ratio,
  };
}

/** Point du canevas vers position sur le plan ; null s'il tombe en dehors de l'image. */
export function toPlan(view: View, point: Point, plan: Size): PlanPosition | null {
  const x = (point.x - view.x) / view.scale / plan.width;
  const y = (point.y - view.y) / view.scale / plan.height;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  return { x, y };
}

/** Position sur le plan vers coordonnées dans l'image (repère du calque Konva). */
export function toImage(position: PlanPosition, plan: Size): Point {
  return { x: position.x * plan.width, y: position.y * plan.height };
}

/** Coordonnées dans l'image vers position sur le plan, ramenée dans les bornes. */
export function fromImage(point: Point, plan: Size): PlanPosition {
  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  return { x: clamp(point.x / plan.width), y: clamp(point.y / plan.height) };
}
