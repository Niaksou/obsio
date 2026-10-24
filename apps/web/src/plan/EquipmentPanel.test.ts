import { describe, expect, it } from 'vitest';
import { parseAliases } from './EquipmentPanel.js';

describe('parseAliases', () => {
  it('sépare, nettoie et dédoublonne les noms', () => {
    expect(parseAliases(' Presse,presse hydraulique, ,Presse ')).toEqual([
      'Presse',
      'presse hydraulique',
    ]);
    expect(parseAliases('')).toEqual([]);
  });
});
