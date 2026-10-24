import type { ExtractedReport, ExtractedReserve } from '@obsio/shared';
import { describe, expect, it } from 'vitest';
import { compareReport, similarity } from './compare.js';

const reserve = (
  reference: string,
  overrides: Partial<ExtractedReserve> = {},
): ExtractedReserve => ({
  reference,
  description: 'Absence de sectionnement omnipolaire.',
  preconisation: 'A réaliser.',
  articleReglementaire: 'R.4215-7 NF C 15-100 § 462',
  localisationTexte: 'ATELIER / COFFRET BT',
  gravite: null,
  nouvelleOuReconduite: 'nouvelle',
  pageSource: 5,
  ...overrides,
});

const report = (reserves: ExtractedReserve[]): ExtractedReport => ({
  organisme: 'SOCOTEC Equipements',
  numeroRapport: '9275A/23/3457',
  typeVerification: 'initiale',
  dateVisite: '2023-07-24',
  site: { nom: 'SCEA ENEE', adresse: null },
  reserves,
});

describe('similarity', () => {
  it('ignore casse, accents, ponctuation et espaces', () => {
    expect(similarity('Absence de schéma.', 'ABSENCE  DE SCHEMA')).toBe(1);
  });
  it('traite deux valeurs nulles comme identiques, une seule comme différente', () => {
    expect(similarity(null, null)).toBe(1);
    expect(similarity(null, 'x')).toBe(0);
  });
});

describe('compareReport', () => {
  it('compte une extraction identique comme parfaite', () => {
    const expected = report([reserve('1'), reserve('2')]);
    const result = compareReport(expected, expected);
    expect(result).toMatchObject({
      matched: 2,
      missing: [],
      invented: [],
      fieldErrors: [],
      headerErrors: [],
    });
  });

  it('repère les réserves oubliées et inventées', () => {
    const result = compareReport(
      report([reserve('1'), reserve('2')]),
      report([reserve('1'), reserve('7')]),
    );
    expect(result.missing).toEqual(['2']);
    expect(result.invented).toEqual(['7']);
  });

  it('rapproche les références malgré les zéros et la ponctuation', () => {
    const result = compareReport(report([reserve('3')]), report([reserve('03')]));
    expect(result.matched).toBe(1);
  });

  it('signale un champ faux sans pénaliser une différence de mise en forme', () => {
    const result = compareReport(
      report([reserve('1')]),
      report([
        reserve('1', {
          description: 'absence de sectionnement omnipolaire',
          nouvelleOuReconduite: 'reconduite',
        }),
      ]),
    );
    expect(result.fieldErrors.map((e) => e.field)).toEqual(['nouvelleOuReconduite']);
  });

  it("accepte un nom d'organisme abrégé, pas une autre date", () => {
    const actual = { ...report([]), organisme: 'SOCOTEC', dateVisite: '2023-08-04' };
    expect(compareReport(report([]), actual).headerErrors.map((e) => e.field)).toEqual([
      'dateVisite',
    ]);
  });
});
