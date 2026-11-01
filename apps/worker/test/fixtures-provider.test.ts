import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { createFixturesProvider } from '../src/extraction/fixtures.js';
import { ExtractionError } from '../src/extraction/provider.js';

const expected = {
  documents: [
    {
      type: 'periodique',
      organisme: 'Organisme',
      numeroRapport: null,
      dateVisite: '2026-03-12',
      site: { nom: 'Usine', adresse: null },
      q18: null,
      q19: null,
      reserves: [
        {
          reference: '1',
          codeObservation: null,
          description: 'Absence de protection',
          preconisation: null,
          articleReglementaire: null,
          localisationTexte: 'TGBT',
          gravite: null,
          nouvelleOuReconduite: null,
          pageSource: 1,
          constatationQ18: null,
          thermique: null,
        },
      ],
    },
  ],
};

describe('fournisseur de démonstration', () => {
  it('rejoue le résultat attendu du PDF reconnu et refuse un autre PDF', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'obsio-fixtures-'));
    await writeFile(join(directory, 'a.pdf'), '%PDF-a');
    await writeFile(join(directory, 'a.expected.json'), JSON.stringify(expected));
    const provider = createFixturesProvider(directory);

    const { report, trace } = await provider.extractFromOcr(
      await provider.ocr(Buffer.from('%PDF-a')),
    );
    expect(report.documents[0]!.reserves[0]).toMatchObject({ reference: '1', confiance: 1 });
    expect(trace.provider).toBe('fixtures');

    await expect(
      provider.extractFromOcr(await provider.ocr(Buffer.from('%PDF-b'))),
    ).rejects.toBeInstanceOf(ExtractionError);
  });

  it('est refusé en production', () => {
    expect(() =>
      loadConfig({ ...process.env, NODE_ENV: 'production', EXTRACTION_PROVIDER: 'fixtures' }),
    ).toThrow(/réservé au développement/);
  });
});
