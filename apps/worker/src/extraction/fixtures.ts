import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { extractedReportSchema, providerReportSchema } from '@obsio/shared';
import { ExtractionError, type ExtractionProvider, type ExtractionTrace } from './provider.js';

/**
 * Fournisseur de démonstration, pour le développement uniquement : il reconnaît un PDF du jeu de
 * test (même contenu) et renvoie son résultat attendu, écrit à la main. Il permet de dérouler
 * l'import de bout en bout sans appeler Mistral ; un autre PDF échoue clairement.
 */
export function createFixturesProvider(directory: string): ExtractionProvider {
  const sha256 = (data: Buffer) => createHash('sha256').update(data).digest('hex');

  async function findFixture(hash: string): Promise<string | null> {
    for (const entry of await readdir(directory, { recursive: true })) {
      if (!entry.endsWith('.pdf')) continue;
      const path = join(directory, entry);
      if (sha256(await readFile(path)) === hash) return path;
    }
    return null;
  }

  const trace = (rawOutput: string): ExtractionTrace => ({
    provider: 'fixtures',
    ocrModel: 'fixtures',
    extractionModel: 'fixtures',
    promptVersion: 'fixtures',
    attempts: 1,
    rawOutput,
    usage: { ocrPages: 0, promptTokens: 0, completionTokens: 0 },
  });

  return {
    async ocr(pdf) {
      const fixture = await findFixture(sha256(pdf));
      return { model: 'fixtures', pages: [], raw: { fixture } };
    },

    async extractFromOcr(document) {
      const { fixture } = document.raw as { fixture: string | null };
      if (!fixture) {
        throw new ExtractionError(
          'Fournisseur de démonstration : ce PDF ne fait pas partie du jeu de test.',
          trace(''),
        );
      }
      const raw = await readFile(fixture.replace(/\.pdf$/, '.expected.json'), 'utf-8');
      const expected = extractedReportSchema.parse(JSON.parse(raw));
      // Résultat relu à la main : confiance maximale, toujours soumis à la validation humaine.
      const report = providerReportSchema.parse({
        documents: expected.documents.map((doc) => ({
          ...doc,
          reserves: doc.reserves.map((reserve) => ({ ...reserve, confiance: 1 })),
        })),
      });
      return { report, trace: trace(raw) };
    },
  };
}
