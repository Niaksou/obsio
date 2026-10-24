import { describe, expect, it } from 'vitest';
import { renderScale } from './rasterize.js';

describe('renderScale', () => {
  it('limite le côté le plus long', () => {
    const scale = renderScale(842, 595); // A4 paysage en points
    expect(Math.round(842 * scale)).toBe(4096);
  });

  it('limite la surface pour un plan presque carré', () => {
    const scale = renderScale(1000, 1000);
    expect(1000 * scale * 1000 * scale).toBeLessThanOrEqual(16_000_000 + 1);
  });
});
