import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractedReportSchema, type ExtractedReport } from '@obsio/shared';

/** Dossier des rapports de test (hors dépôt, voir .gitignore). */
export const FIXTURES_DIR = fileURLToPath(new URL('../../../fixtures/reports', import.meta.url));

export interface Fixture {
  /** Chemin relatif à FIXTURES_DIR, sans extension (« public/01-socotec-manche »). */
  id: string;
  pdfPath: string;
  expected: ExtractedReport;
}

async function findExpectedFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return findExpectedFiles(path);
      return entry.name.endsWith('.expected.json') ? [path] : [];
    }),
  );
  return nested.flat().sort();
}

/** Charge chaque résultat attendu, validé par le schéma, avec le PDF associé. */
export async function loadFixtures(): Promise<Fixture[]> {
  const files = await findExpectedFiles(FIXTURES_DIR);
  return Promise.all(
    files.map(async (file) => {
      const id = relative(FIXTURES_DIR, file).replace(/\.expected\.json$/, '');
      const parsed = extractedReportSchema.safeParse(JSON.parse(await readFile(file, 'utf-8')));
      if (!parsed.success) {
        const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')} : ${i.message}`);
        throw new Error(`${id}.expected.json invalide :\n${issues.join('\n')}`);
      }
      const pdfPath = join(FIXTURES_DIR, `${id}.pdf`);
      await readFile(pdfPath).catch(() => {
        throw new Error(`${id} : PDF introuvable (${pdfPath})`);
      });
      return { id, pdfPath, expected: parsed.data };
    }),
  );
}
