import type { ProviderReport } from '@obsio/shared';
import { describe, expect, it } from 'vitest';
import { mergeDuplicateDocuments } from './normalize.js';

type Document = ProviderReport['documents'][number];
type Reserve = Document['reserves'][number];

const reserve = (reference: string, pageSource: number, extra: Partial<Reserve> = {}): Reserve => ({
  reference,
  codeObservation: null,
  description: `Échauffement ${reference}`,
  preconisation: null,
  articleReglementaire: null,
  localisationTexte: null,
  gravite: null,
  nouvelleOuReconduite: null,
  pageSource,
  constatationQ18: null,
  thermique: null,
  confiance: 0.9,
  ...extra,
});

const document = (
  type: Document['type'],
  numero: string | null,
  reserves: Reserve[],
): Document => ({
  type,
  organisme: 'Organisme',
  numeroRapport: numero,
  dateVisite: null,
  site: { nom: 'Usine', adresse: null },
  q18: null,
  q19: null,
  reserves,
});

describe('mergeDuplicateDocuments', () => {
  it('fusionne la synthèse et les fiches d’un même Q19, sans réserve en double', () => {
    const merged = mergeDuplicateDocuments({
      documents: [
        document('q18', 'R1', []),
        document('q19', '2111', [reserve('1', 19, { gravite: 'Priorité 2' }), reserve('2', 20)]),
        document('q19', '2111', [reserve('1', 8), reserve('2', 8), reserve('3', 21)]),
      ],
    });
    expect(merged.documents.map((d) => d.type)).toEqual(['q18', 'q19']);
    expect(merged.documents[1]!.reserves.map((r) => [r.reference, r.pageSource])).toEqual([
      ['1', 19],
      ['2', 20],
      ['3', 21],
    ]);
  });

  it('garde la lecture la plus complète d’une réserve', () => {
    const merged = mergeDuplicateDocuments({
      documents: [
        document('q19', '2111', [reserve('1', 19)]),
        document('q19', '2111', [reserve('1', 8, { localisationTexte: 'TGBT' })]),
      ],
    });
    expect(merged.documents[0]!.reserves[0]!.localisationTexte).toBe('TGBT');
  });

  it('ne fusionne ni des types différents ni des documents sans numéro', () => {
    const report = {
      documents: [
        document('periodique', null, [reserve('1', 3)]),
        document('periodique', null, [reserve('1', 9)]),
        document('q18', null, []),
      ],
    };
    expect(mergeDuplicateDocuments(report).documents).toHaveLength(3);
  });
});
