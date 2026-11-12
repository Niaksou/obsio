import type { Equipment, Zone } from '@obsio/shared';
import { describe, expect, it } from 'vitest';
import { groupByZone, labelAnchor, shapeError, snapPoint, toPositions, zoneOf } from './zones.js';

const rect = (x: number, y: number, width: number, height: number) => [
  { x, y },
  { x: x + width, y },
  { x: x + width, y: y + height },
  { x, y: y + height },
];
const zone = (id: string, points: Zone['points']): Zone => ({ id, floorId: 'f', name: id, points });

// Atelier en L : bande du haut sur toute la largeur gauche, aile qui descend à gauche.
const L = [
  { x: 0, y: 0 },
  { x: 0.6, y: 0 },
  { x: 0.6, y: 0.3 },
  { x: 0.2, y: 0.3 },
  { x: 0.2, y: 1 },
  { x: 0, y: 1 },
];
const atelier = zone('Atelier', L);
const cabine = zone('Cabine', rect(0.02, 0.02, 0.1, 0.1));
const quai = zone('Quai', rect(0.6, 0, 0.4, 0.5));

const item = (name: string, position: Equipment['position']): Equipment => ({
  id: name,
  floorId: 'f',
  type: 'td',
  name,
  aliases: [],
  position,
});

describe('zones du plan', () => {
  it('rattache un repère à la plus petite zone qui le contient, en suivant la forme', () => {
    const zones = [atelier, cabine, quai];
    expect(zoneOf({ x: 0.05, y: 0.05 }, zones)?.id).toBe('Cabine');
    expect(zoneOf({ x: 0.1, y: 0.8 }, zones)?.id).toBe('Atelier');
    // Dans le rectangle qui entoure le L, mais dans son creux.
    expect(zoneOf({ x: 0.4, y: 0.8 }, zones)).toBeNull();
    expect(zoneOf(null, zones)).toBeNull();
  });

  it('regroupe par zone, hors zone et non placés en dernier', () => {
    const groups = groupByZone(
      [
        item('TD1', { x: 0.05, y: 0.05 }),
        item('TD2', { x: 0.7, y: 0.2 }),
        item('TD3', { x: 0.4, y: 0.8 }),
        item('TD4', null),
      ],
      [quai, cabine, atelier],
    );
    expect(groups.map((g) => [g.zone?.name ?? null, g.items.map((i) => i.name)])).toEqual([
      ['Atelier', []],
      ['Cabine', ['TD1']],
      ['Quai', ['TD2']],
      [null, ['TD3', 'TD4']],
    ]);
  });

  it('redresse les côtés presque droits et referme d’équerre sur le premier angle', () => {
    expect(snapPoint([], { x: 10, y: 12 }, 8)).toEqual({ x: 10, y: 12 });
    expect(snapPoint([{ x: 0, y: 0 }], { x: 100, y: 6 }, 8)).toEqual({ x: 100, y: 0 });
    expect(snapPoint([{ x: 0, y: 0 }], { x: 5, y: 100 }, 8)).toEqual({ x: 0, y: 100 });
    expect(snapPoint([{ x: 0, y: 0 }], { x: 100, y: 60 }, 8)).toEqual({ x: 100, y: 60 });
    // Dernier angle d'un L : aligné sur le premier, verticalement.
    const drawn = [
      { x: 0, y: 0 },
      { x: 600, y: 0 },
      { x: 600, y: 300 },
      { x: 200, y: 300 },
      { x: 200, y: 1000 },
    ];
    expect(snapPoint(drawn, { x: 5, y: 995 }, 8)).toEqual({ x: 0, y: 1000 });
  });

  it('convertit en proportions et explique un contour refusé', () => {
    const plan = { width: 1000, height: 500 };
    expect(toPositions([{ x: -10, y: 250 }], plan)).toEqual([{ x: 0, y: 0.5 }]);
    expect(shapeError(L)).toBeNull();
    expect(shapeError(L.slice(0, 2))).toBe('Il faut au moins trois angles');
    expect(shapeError([L[0]!, L[2]!, L[1]!, L[3]!])).toBe('Les côtés de la zone se croisent');
  });

  it('pose le nom sur l’angle le plus haut, puis le plus à gauche', () => {
    expect(labelAnchor(L)).toEqual({ x: 0, y: 0 });
    expect(
      labelAnchor([
        { x: 0.5, y: 0.4 },
        { x: 0.9, y: 0.1 },
        { x: 0.2, y: 0.1 },
      ]),
    ).toEqual({
      x: 0.2,
      y: 0.1,
    });
  });
});
