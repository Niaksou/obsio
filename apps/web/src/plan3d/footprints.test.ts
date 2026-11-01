import { describe, expect, it } from 'vitest';
import { footprints, type SceneFloor } from './BuildingScene.js';

const floor = (id: string, scale: number | null): SceneFloor => ({
  id,
  name: id,
  level: 0,
  plan: { imageUrl: 'http://plan', width: 2000, height: 1000, scale },
  equipment: [],
});

describe('dimensions des étages en 3D', () => {
  it('en vrais mètres quand tous les plans sont calibrés', () => {
    const sizes = footprints([floor('rdc', 0.03), floor('r1', 0.015)]);
    expect(sizes.get('rdc')).toEqual({ width: 60, depth: 30 });
    expect(sizes.get('r1')).toEqual({ width: 30, depth: 15 });
  });

  it('à largeur commune si un plan n’est pas calibré', () => {
    const sizes = footprints([floor('rdc', 0.03), floor('r1', null)]);
    expect(sizes.get('rdc')).toEqual(sizes.get('r1'));
    expect(sizes.get('rdc')).toEqual({ width: 40, depth: 20 });
  });
});
