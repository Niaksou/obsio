import { describe, expect, it } from 'vitest';
import {
  bestMatch,
  containsName,
  proposeEquipment,
  sameAnomaly,
  similarity,
} from '../src/imports/matching.js';

describe('proposeEquipment', () => {
  const equipment = [
    { id: 'tgbt', name: 'TGBT', aliases: [] },
    { id: 'td2', name: 'TD2', aliases: ['tableau atelier'] },
    { id: 'td', name: 'TD', aliases: [] },
    { id: 'presse', name: 'Presse 3', aliases: [] },
  ];

  it('reconnaît un repère ou un alias, espaces et casse ignorés', () => {
    expect(containsName('BATIMENT A / TD 2 / départ 4', 'TD2')).toBe(true);
    expect(containsName('BATIMENT A / TD2', 'TD')).toBe(false);
    expect(proposeEquipment('Atelier / td2 / Départ 4', equipment)).toBe('td2');
    expect(proposeEquipment('ATELIER / Tableau atelier', equipment)).toBe('td2');
    expect(proposeEquipment('Local / Presse 3', equipment)).toBe('presse');
  });

  it('ne propose rien sans correspondance ou en cas d’ambiguïté', () => {
    expect(proposeEquipment('Bureaux / éclairage', equipment)).toBeNull();
    expect(proposeEquipment(null, equipment)).toBeNull();
    expect(
      proposeEquipment('TGBT / TD9', [
        { id: 'a', name: 'TGBT', aliases: [] },
        { id: 'b', name: 'TGBT', aliases: [] },
      ]),
    ).toBeNull();
  });
});

describe('sameAnomaly', () => {
  const base = {
    id: 'x',
    description: 'Absence de dispositif différentiel 30 mA sur le circuit prises',
    equipmentId: null,
    codeObservation: null,
    localisation: null,
  };

  it('rapproche par code d’observation, sinon par texte proche', () => {
    expect(
      sameAnomaly(
        { ...base, codeObservation: 'LM/1/0' },
        { ...base, description: 'autre', codeObservation: 'lm/1/0' },
      ),
    ).toBe(1);
    expect(sameAnomaly({ ...base, codeObservation: 'A' }, { ...base, codeObservation: 'B' })).toBe(
      0,
    );
    expect(
      similarity(base.description, 'Absence de dispositif différentiel 30 mA circuit prises'),
    ).toBeGreaterThan(0.75);
  });

  it('exige moins de ressemblance quand l’équipement est le même', () => {
    const other = {
      ...base,
      id: 'y',
      description: 'Absence de différentiel sur le circuit prises atelier',
    };
    expect(sameAnomaly(base, other)).toBe(0);
    expect(
      sameAnomaly({ ...base, equipmentId: 'td2' }, { ...other, equipmentId: 'td2' }),
    ).toBeGreaterThan(0);
    expect(bestMatch({ ...base, equipmentId: 'td2' }, [{ ...other, equipmentId: 'td2' }])).toBe(
      'y',
    );
  });
});
