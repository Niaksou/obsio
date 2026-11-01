import type { Point } from './geometry.js';

// Échelle d'un plan : mètres par pixel de l'image, calibrée sur une cote connue.

export function pixelDistance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Échelle déduite d'un segment tracé sur l'image et de sa longueur réelle. */
export function metersPerPixel(a: Point, b: Point, meters: number): number | null {
  const pixels = pixelDistance(a, b);
  return pixels > 0 && meters > 0 ? meters / pixels : null;
}

/** « 85 cm », « 3,25 m », « 12,4 m », « 140 m ». */
export function formatLength(meters: number): string {
  const number = (value: number, digits: number) =>
    value.toLocaleString('fr-FR', { maximumFractionDigits: digits });
  if (meters < 1) return `${number(meters * 100, 0)} cm`;
  if (meters < 10) return `${number(meters, 2)} m`;
  if (meters < 100) return `${number(meters, 1)} m`;
  return `${number(meters, 0)} m`;
}

const BAR_LENGTHS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500];

/** Barre d'échelle à la longueur ronde la plus grande qui tient dans `maxPixels` à l'écran. */
export function scaleBar(screenPixelsPerMeter: number, maxPixels = 140) {
  const meters =
    [...BAR_LENGTHS].reverse().find((length) => length * screenPixelsPerMeter <= maxPixels) ??
    BAR_LENGTHS[0]!;
  return { meters, pixels: meters * screenPixelsPerMeter, label: formatLength(meters) };
}
