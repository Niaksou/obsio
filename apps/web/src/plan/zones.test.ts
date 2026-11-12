import type { Equipment, Zone } from '@obsio/shared';
import { describe, expect, it } from 'vitest';
import { boundsFromPoints, groupByZone, isUsable, zoneOf } from './zones.js';

const zone = (id: string, x: number, y: number, width: number, height: number): Zone => ({
  id,
  floorId: 'f',
  name: id,
  bounds: { x, y, width, height },
});

const atelier = zone('Atelier', 0, 0, 0.6, 1);
const cabine = zone('Cabine', 0.1, 0.1, 0.2, 0.2);
const quai = zone('Quai', 0.6, 0, 0.4, 0.5);

const item = (name: string, position: Equipment['position']): Equipment => ({
  id: name,
  floorId: 'f',
  type: 'td',
  name,
  aliases: [],
  position,
});

describe('zones du plan', () => {
  it('construit le rectangle depuis deux coins, dans n’importe quel ordre', () => {
    const plan = { width: 1000, height: 500 };
    const bounds = boundsFromPoints({ x: 600, y: 400 }, { x: 100, y: 100 }, plan);
    expect(bounds.x).toBeCloseTo(0.1);
    expect(bounds.y).toBeCloseTo(0.2);
    expect(bounds.width).toBeCloseTo(0.5);
    expect(bounds.height).toBeCloseTo(0.6);
    expect(boundsFromPoints({ x: -50, y: 0 }, { x: 2000, y: 500 }, plan)).toMatchObject({
      x: 0,
      width: 1,
    });
    expect(isUsable(boundsFromPoints({ x: 10, y: 10 }, { x: 11, y: 300 }, plan))).toBe(false);
  });

  it('rattache un repère à la plus petite zone qui le contient', () => {
    const zones = [atelier, cabine, quai];
    expect(zoneOf({ x: 0.15, y: 0.15 }, zones)?.id).toBe('Cabine');
    expect(zoneOf({ x: 0.4, y: 0.8 }, zones)?.id).toBe('Atelier');
    expect(zoneOf({ x: 0.8, y: 0.9 }, zones)).toBeNull();
    expect(zoneOf(null, zones)).toBeNull();
  });

  it('regroupe par zone, hors zone et non placés en dernier', () => {
    const groups = groupByZone(
      [
        item('TD1', { x: 0.15, y: 0.15 }),
        item('TD2', { x: 0.7, y: 0.2 }),
        item('TD3', { x: 0.8, y: 0.9 }),
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
});
