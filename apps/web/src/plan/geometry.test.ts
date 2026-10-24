import { describe, expect, it } from 'vitest';
import { fitView, fromImage, toImage, toPlan, zoomAt } from './geometry.js';

const plan = { width: 2000, height: 1000 };

describe('fitView', () => {
  it('ajuste le plan au canevas en gardant ses proportions, centré', () => {
    const view = fitView(plan, { width: 1048, height: 800 });
    expect(view.scale).toBeCloseTo(0.5);
    expect(view.x).toBeCloseTo(24);
    expect(view.y).toBeCloseTo((800 - 500) / 2);
  });
});

describe('zoomAt', () => {
  it('garde fixe le point visé', () => {
    const view = { scale: 1, x: 100, y: 50 };
    const anchor = { x: 400, y: 300 };
    const before = toPlan(view, anchor, plan)!;
    const after = toPlan(zoomAt(view, anchor, 2, { min: 0.1, max: 10 }), anchor, plan)!;
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it('borne le zoom', () => {
    const view = { scale: 1, x: 0, y: 0 };
    expect(zoomAt(view, { x: 0, y: 0 }, 100, { min: 0.5, max: 4 }).scale).toBe(4);
    expect(zoomAt(view, { x: 0, y: 0 }, 0.01, { min: 0.5, max: 4 }).scale).toBe(0.5);
  });
});

describe('conversions', () => {
  const view = { scale: 0.5, x: 24, y: 150 };

  it('convertit un clic sur le plan en position proportionnelle', () => {
    expect(toPlan(view, { x: 24 + 500, y: 150 + 125 }, plan)).toEqual({ x: 0.5, y: 0.25 });
  });

  it('ignore un clic hors du plan', () => {
    expect(toPlan(view, { x: 10, y: 160 }, plan)).toBeNull();
  });

  it("fait l'aller-retour avec les coordonnées de l'image et borne un glisser hors du plan", () => {
    expect(fromImage(toImage({ x: 0.3, y: 0.7 }, plan), plan)).toEqual({ x: 0.3, y: 0.7 });
    expect(fromImage({ x: -50, y: 1200 }, plan)).toEqual({ x: 0, y: 1 });
  });
});
