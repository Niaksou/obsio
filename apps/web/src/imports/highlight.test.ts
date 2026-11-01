import { describe, expect, it } from 'vitest';
import { findHighlight } from './highlight.js';

describe('findHighlight', () => {
  const items = [
    'Observation 12',
    'Absence de dispositif',
    'différentiel 30 mA sur le',
    'circuit prises.',
    'Observation 13',
  ];

  it('retrouve un passage coupé sur plusieurs lignes, accents et casse ignorés', () => {
    expect(
      findHighlight(items, 'ABSENCE DE DISPOSITIF DIFFERENTIEL 30 mA sur le circuit prises'),
    ).toEqual([1, 2, 3]);
  });

  it('se rabat sur le début du texte quand la fin a été retouchée', () => {
    expect(
      findHighlight(
        items,
        'Absence de dispositif différentiel 30 mA sur le circuit prises (atelier)',
      ),
    ).toEqual([1, 2, 3]);
  });

  it('ne surligne rien sans correspondance', () => {
    expect(findHighlight(items, 'Câble non protégé mécaniquement')).toEqual([]);
    expect(findHighlight(items, 'ab')).toEqual([]);
  });
});
