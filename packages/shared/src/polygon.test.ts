import { describe, expect, it } from 'vitest';
import {
  isSimplePolygon,
  polygonArea,
  polygonBounds,
  polygonContains,
  zoneShapeSchema,
} from './index.js';

// Pièce en L : 0,0 → 0,6 de large en haut, aile de 0,3 de large vers le bas.
const L = [
  { x: 0, y: 0 },
  { x: 0.6, y: 0 },
  { x: 0.6, y: 0.3 },
  { x: 0.3, y: 0.3 },
  { x: 0.3, y: 0.8 },
  { x: 0, y: 0.8 },
];

describe('contours de zone', () => {
  it('mesure la surface et le cadre d’une pièce en L', () => {
    expect(polygonArea(L)).toBeCloseTo(0.6 * 0.3 + 0.3 * 0.5);
    expect(polygonBounds(L)).toEqual({ x: 0, y: 0, width: 0.6, height: 0.8 });
  });

  it('situe un point dans le L, pas dans le creux', () => {
    expect(polygonContains(L, { x: 0.5, y: 0.1 })).toBe(true);
    expect(polygonContains(L, { x: 0.1, y: 0.7 })).toBe(true);
    expect(polygonContains(L, { x: 0.5, y: 0.6 })).toBe(false);
  });

  it('refuse un contour dont les côtés se croisent, trop petit ou à deux angles', () => {
    const eight = [
      { x: 0, y: 0 },
      { x: 0.5, y: 0.5 },
      { x: 0.5, y: 0 },
      { x: 0, y: 0.5 },
    ];
    expect(isSimplePolygon(L)).toBe(true);
    expect(isSimplePolygon(eight)).toBe(false);
    expect(zoneShapeSchema.safeParse(L).success).toBe(true);
    expect(zoneShapeSchema.safeParse(eight).success).toBe(false);
    expect(zoneShapeSchema.safeParse(L.slice(0, 2)).success).toBe(false);
    expect(
      zoneShapeSchema.safeParse([
        { x: 0, y: 0 },
        { x: 0.001, y: 0 },
        { x: 0, y: 0.001 },
      ]).success,
    ).toBe(false);
  });
});
