import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { loadConfig } from '../src/config.js';
import { createMistralProvider } from '../src/extraction/mistral.js';
import { ExtractionError, type OcrDocument } from '../src/extraction/provider.js';
import { compareReport, RESERVE_FIELDS, type ReportComparison } from './compare.js';
import { FIXTURES_DIR, loadFixtures } from './fixtures.js';

// Passe le jeu de test dans l'extraction et compare au résultat attendu : pnpm eval:extraction
//   --only <texte>   limite aux rapports dont l'identifiant contient ce texte
//   --model <id>     modèle d'extraction à essayer à la place de celui de la configuration
//   --no-cache       refait l'OCR au lieu de réutiliser le cache

// Seuils provisoires de sortie de J1 (à valider) : rappel, réserves inventées, descriptions fidèles.
const EXIT_CRITERIA = { recall: 0.95, invented: 0, description: 0.9 };

const { values } = parseArgs({
  options: {
    only: { type: 'string' },
    model: { type: 'string' },
    'no-cache': { type: 'boolean', default: false },
  },
});

const config = loadConfig();
if (!config.MISTRAL_API_KEY) throw new Error('MISTRAL_API_KEY doit être défini dans .env');
const extractionModel = values.model ?? config.MISTRAL_EXTRACTION_MODEL;
const provider = createMistralProvider({
  apiKey: config.MISTRAL_API_KEY,
  ocrModel: config.MISTRAL_OCR_MODEL,
  extractionModel,
});

const cacheDir = join(FIXTURES_DIR, '.cache');
const runDir = join(
  FIXTURES_DIR,
  '.runs',
  `${new Date().toISOString().replace(/[:.]/g, '-')}_${extractionModel}`,
);
await mkdir(cacheDir, { recursive: true });
await mkdir(runDir, { recursive: true });

async function ocrWithCache(id: string, pdfPath: string): Promise<OcrDocument> {
  const path = join(cacheDir, `${id.replaceAll('/', '__')}.${config.MISTRAL_OCR_MODEL}.json`);
  if (!values['no-cache']) {
    const cached = await readFile(path, 'utf-8').catch(() => null);
    if (cached) return JSON.parse(cached) as OcrDocument;
  }
  const document = await provider.ocr(await readFile(pdfPath));
  await writeFile(path, JSON.stringify(document));
  return document;
}

const fixtures = (await loadFixtures()).filter((f) => !values.only || f.id.includes(values.only));
const results: {
  id: string;
  comparison: ReportComparison | null;
  error?: string;
  tokens: number;
}[] = [];

for (const fixture of fixtures) {
  process.stdout.write(`${fixture.id} … `);
  const outputPath = join(runDir, `${fixture.id.replaceAll('/', '__')}.json`);
  try {
    const document = await ocrWithCache(fixture.id, fixture.pdfPath);
    const { report, trace } = await provider.extractFromOcr(document);
    await writeFile(outputPath, JSON.stringify({ report, trace }, null, 2));
    const comparison = compareReport(fixture.expected, report);
    results.push({
      id: fixture.id,
      comparison,
      tokens: trace.usage.promptTokens + trace.usage.completionTokens,
    });
    console.log(
      `${comparison.matched}/${comparison.expectedCount} trouvées, ${comparison.invented.length} inventée(s)`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof ExtractionError) {
      await writeFile(outputPath, JSON.stringify({ error: message, trace: error.trace }, null, 2));
    }
    results.push({ id: fixture.id, comparison: null, error: message, tokens: 0 });
    console.log(`ÉCHEC : ${message.split('\n')[0]}`);
  }
}

// --- Synthèse
const done = results.flatMap((r) => (r.comparison ? [r.comparison] : []));
const sum = (pick: (c: ReportComparison) => number) =>
  done.reduce((total, c) => total + pick(c), 0);
const expected = sum((c) => c.expectedCount);
const matched = sum((c) => c.matched);
const invented = sum((c) => c.invented.length);
const pct = (n: number, d: number) => (d === 0 ? '—' : `${((100 * n) / d).toFixed(1)} %`);

const lines: string[] = [
  `# Évaluation de l'extraction`,
  '',
  `- OCR : ${config.MISTRAL_OCR_MODEL} · extraction : ${extractionModel}`,
  `- Rapports : ${results.length} (${results.length - done.length} en échec)`,
  `- Réserves retrouvées : ${matched}/${expected} (${pct(matched, expected)})`,
  `- Réserves inventées : ${invented}`,
  `- Jetons consommés : ${results.reduce((t, r) => t + r.tokens, 0)}`,
  '',
  '| Champ | Corrects | Taux |',
  '|---|---|---|',
  ...RESERVE_FIELDS.map(
    (f) =>
      `| ${f} | ${sum((c) => c.fieldsCorrect[f])}/${matched} | ${pct(
        sum((c) => c.fieldsCorrect[f]),
        matched,
      )} |`,
  ),
  '',
  '| Rapport | Trouvées | Oubliées | Inventées | Erreurs de champ | En-tête |',
  '|---|---|---|---|---|---|',
  ...results.map(({ id, comparison: c, error }) =>
    c
      ? `| ${id} | ${c.matched}/${c.expectedCount} | ${c.missing.join(', ') || '—'} | ${c.invented.join(', ') || '—'} | ${c.fieldErrors.length} | ${c.headerErrors.map((e) => e.field).join(', ') || 'ok'} |`
      : `| ${id} | échec : ${error?.split('\n')[0]} | | | | |`,
  ),
];

const recall = expected === 0 ? 1 : matched / expected;
const description = matched === 0 ? 1 : sum((c) => c.fieldsCorrect.description) / matched;
const passed =
  done.length === results.length &&
  recall >= EXIT_CRITERIA.recall &&
  invented <= EXIT_CRITERIA.invented &&
  description >= EXIT_CRITERIA.description;
lines.push(
  '',
  `Critère de sortie (rappel ≥ ${EXIT_CRITERIA.recall * 100} %, aucune invention, descriptions ≥ ${EXIT_CRITERIA.description * 100} %) : ${passed ? 'ATTEINT' : 'non atteint'}`,
);

// Détail des erreurs de champ, pour la relecture.
lines.push('', '## Détail des erreurs', '');
for (const { id, comparison: c } of results) {
  if (!c || (c.fieldErrors.length === 0 && c.headerErrors.length === 0)) continue;
  lines.push(`### ${id}`, '');
  for (const e of [
    ...c.headerErrors.map((h) => ({ reference: 'en-tête', ...h })),
    ...c.fieldErrors,
  ]) {
    lines.push(
      `- ${e.reference} · ${e.field} : attendu ${JSON.stringify(e.expected)} — obtenu ${JSON.stringify(e.actual)}`,
    );
  }
  lines.push('');
}

const summary = lines.join('\n');
await writeFile(join(runDir, 'synthese.md'), summary);
console.log(`\n${summary.split('\n## Détail')[0]}\nDétail : ${join(runDir, 'synthese.md')}`);
