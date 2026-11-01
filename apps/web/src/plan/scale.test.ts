import { describe, expect, it } from 'vitest';
import { formatLength, metersPerPixel, scaleBar } from './scale.js';

describe('échelle du plan', () => {
  it('déduit les mètres par pixel d’une cote connue', () => {
    expect(metersPerPixel({ x: 0, y: 0 }, { x: 300, y: 400 }, 10)).toBeCloseTo(0.02);
    expect(metersPerPixel({ x: 5, y: 5 }, { x: 5, y: 5 }, 10)).toBeNull();
    expect(metersPerPixel({ x: 0, y: 0 }, { x: 10, y: 0 }, 0)).toBeNull();
  });

  it('écrit les longueurs à la française', () => {
    expect(formatLength(0.854)).toBe('85 cm');
    expect(formatLength(3.254)).toBe('3,25 m');
    expect(formatLength(12.44)).toBe('12,4 m');
    expect(formatLength(140.2)).toBe('140 m');
  });

  it('choisit une barre d’échelle ronde qui tient à l’écran', () => {
    // 25 pixels d'écran par mètre : 5 m font 125 px, 10 m dépasseraient.
    expect(scaleBar(25)).toEqual({ meters: 5, pixels: 125, label: '5 m' });
    expect(scaleBar(2000)).toMatchObject({ meters: 0.1, label: '10 cm' });
  });
});
