import type { ExtractedDocument, ExtractedReport, ExtractedReserve } from '@obsio/shared';
import { describe, expect, it } from 'vitest';
import { compareDocument, compareReport, similarity } from './compare.js';

const reserve = (
  reference: string,
  overrides: Partial<ExtractedReserve> = {},
): ExtractedReserve => ({
  reference,
  codeObservation: null,
  description: 'Absence de sectionnement omnipolaire.',
  preconisation: 'A réaliser.',
  articleReglementaire: 'R.4215-7 NF C 15-100 § 462',
  localisationTexte: 'ATELIER / COFFRET BT',
  gravite: null,
  nouvelleOuReconduite: 'nouvelle',
  pageSource: 5,
  constatationQ18: null,
  thermique: null,
  ...overrides,
});

const document = (
  reserves: ExtractedReserve[],
  overrides: Partial<ExtractedDocument> = {},
): ExtractedDocument => ({
  type: 'initiale',
  organisme: 'SOCOTEC Equipements',
  numeroRapport: '9275A/23/3457',
  dateVisite: '2023-07-24',
  site: { nom: 'SCEA ENEE', adresse: null },
  q18: null,
  q19: null,
  reserves,
  ...overrides,
});

const report = (...documents: ExtractedDocument[]): ExtractedReport => ({ documents });

describe('similarity', () => {
  it('ignore casse, accents, ponctuation et espaces', () => {
    expect(similarity('Absence de schéma.', 'ABSENCE  DE SCHEMA')).toBe(1);
  });
  it('traite deux valeurs nulles comme identiques, une seule comme différente', () => {
    expect(similarity(null, null)).toBe(1);
    expect(similarity(null, 'x')).toBe(0);
  });
});

describe('compareDocument', () => {
  it('compte une extraction identique comme parfaite', () => {
    const expected = document([reserve('1'), reserve('2')]);
    expect(compareDocument(expected, expected)).toMatchObject({
      matched: 2,
      missing: [],
      invented: [],
      fieldErrors: [],
      headerErrors: [],
    });
  });

  it('repère les réserves oubliées et inventées', () => {
    const result = compareDocument(
      document([reserve('1'), reserve('2')]),
      document([reserve('1'), reserve('7')]),
    );
    expect(result.missing).toEqual(['2']);
    expect(result.invented).toEqual(['7']);
  });

  it('rapproche les références malgré les zéros et la ponctuation', () => {
    expect(compareDocument(document([reserve('3')]), document([reserve('03')])).matched).toBe(1);
  });

  it('signale un champ faux sans pénaliser une différence de mise en forme', () => {
    const result = compareDocument(
      document([reserve('1')]),
      document([
        reserve('1', {
          description: 'absence de sectionnement omnipolaire',
          nouvelleOuReconduite: 'reconduite',
        }),
      ]),
    );
    expect(result.fieldErrors.map((e) => e.field)).toEqual(['nouvelleOuReconduite']);
  });

  it("accepte un nom d'organisme abrégé, pas une autre date", () => {
    const actual = document([], { organisme: 'SOCOTEC', dateVisite: '2023-08-04' });
    expect(compareDocument(document([]), actual).headerErrors.map((e) => e.field)).toEqual([
      'dateVisite',
    ]);
  });

  it('tolère un arrondi sur les températures, pas un autre relevé', () => {
    const thermique = { temperatureDefaut: 42.3, temperatureReference: 27.3, ecart: 15 };
    const expected = document([reserve('1', { thermique })]);
    const rounded = document([reserve('1', { thermique: { ...thermique, ecart: 15.04 } })]);
    const wrong = document([
      reserve('1', { thermique: { ...thermique, temperatureDefaut: 24.3 } }),
    ]);
    expect(compareDocument(expected, rounded).fieldErrors).toEqual([]);
    expect(compareDocument(expected, wrong).fieldErrors.map((e) => e.field)).toEqual(['thermique']);
  });

  it('compte toute case Q18 différente comme une erreur', () => {
    const q18 = {
      constatations: Array.from({ length: 8 }, (_, i) => ({
        numero: i + 1,
        etat: 'absence_danger' as const,
      })),
      conclusion: 'pas_de_risque' as const,
    };
    const changed = structuredClone(q18);
    changed.constatations[2]!.etat = 'danger_nouveau' as never;
    const result = compareDocument(
      document([], { type: 'q18', q18 }),
      document([], { type: 'q18', q18: changed }),
    );
    expect(result.headerErrors.map((e) => e.field)).toEqual(['q18']);
  });
});

describe('compareReport', () => {
  it('apparie les documents par type, quel que soit leur ordre', () => {
    const periodique = document([reserve('1')], { type: 'periodique' });
    const q18 = document([reserve('1')], { type: 'q18' });
    const result = compareReport(report(periodique, q18), report(q18, periodique));
    expect(result).toMatchObject({ matched: 2, missing: [], invented: [], headerErrors: [] });
  });

  it("compte les réserves d'un document oublié ou en trop", () => {
    const periodique = document([reserve('1')], { type: 'periodique' });
    const q19 = document([reserve('2')], { type: 'q19' });
    const result = compareReport(report(periodique), report(q19));
    expect(result.missing).toEqual(['periodique 1']);
    expect(result.invented).toEqual(['q19 2']);
    expect(result.headerErrors).toEqual(['periodique.document', 'q19.document']);
  });
});
