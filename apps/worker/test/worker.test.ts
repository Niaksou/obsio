import {
  EXTRACTION_QUEUE,
  extractionOutcomeSchema,
  reportImportKeys,
  type ProviderReport,
} from '@obsio/shared';
import { Queue, QueueEvents } from 'bullmq';
import { Redis } from 'ioredis';
import { pino } from 'pino';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config.js';
import { extractReport } from '../src/extract-report.js';
import {
  ExtractionError,
  type ExtractionProvider,
  type ExtractionTrace,
} from '../src/extraction/provider.js';
import { createS3Storage } from '../src/storage.js';
import { startWorker } from '../src/worker.js';

const trace: ExtractionTrace = {
  provider: 'fake',
  ocrModel: 'fake-ocr',
  extractionModel: 'fake-llm',
  promptVersion: 'test',
  attempts: 1,
  rawOutput: '{}',
  usage: { ocrPages: 1, promptTokens: 10, completionTokens: 5 },
};

const report: ProviderReport = {
  organisme: 'Organisme de test',
  numeroRapport: null,
  typeVerification: 'periodique',
  dateVisite: '2026-03-12',
  site: { nom: 'Usine', adresse: null },
  reserves: [
    {
      reference: '1',
      description: 'Absence de protection',
      preconisation: null,
      articleReglementaire: null,
      localisationTexte: 'TGBT',
      gravite: null,
      nouvelleOuReconduite: null,
      pageSource: 1,
      confiance: 0.9,
    },
  ],
};

// Faux fournisseur : aucune requête vers Mistral pendant les tests.
const fake = {
  ocr: vi.fn<ExtractionProvider['ocr']>(async () => ({
    model: 'fake-ocr',
    pages: [{ number: 1, markdown: 'Observation 1' }],
    raw: {},
  })),
  extractFromOcr: vi.fn<ExtractionProvider['extractFromOcr']>(async () => ({ report, trace })),
};

// File isolée par exécution pour ne pas interférer avec un worker de dev lancé à côté.
const prefix = `test-${crypto.randomUUID()}`;
const config = loadConfig();
const logger = pino({ level: 'silent' });
const storage = createS3Storage(config);
const connection = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
const queue = new Queue(EXTRACTION_QUEUE, { connection, prefix });
const events = new QueueEvents(EXTRACTION_QUEUE, { connection: connection.duplicate(), prefix });
const running = startWorker(config, logger, { prefix, storage, provider: fake });

beforeAll(async () => {
  // Le stockage peut démarrer après les autres services (CI) : on réessaie quelques secondes.
  for (let attempt = 1; ; attempt++) {
    try {
      await storage.ensureBucket();
      return;
    } catch (error) {
      if (attempt === 20) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
});

beforeEach(() => {
  vi.clearAllMocks();
});

afterAll(async () => {
  await running.close();
  await queue.obliterate({ force: true });
  await Promise.all([queue.close(), events.close()]);
  await connection.quit();
  storage.close();
});

/** Dépose un PDF pour un nouvel import et renvoie la charge utile de la tâche. */
async function depositPdf(content = '%PDF-1.7 test') {
  const data = { organisationId: crypto.randomUUID(), importId: crypto.randomUUID() };
  const keys = reportImportKeys(data.organisationId, data.importId);
  await storage.put(keys.pdf, Buffer.from(content), 'application/pdf');
  return { data, keys };
}

async function readOutcome(key: string) {
  const body = await storage.get(key);
  return extractionOutcomeSchema.parse(JSON.parse(body!.toString('utf-8')));
}

describe("worker d'extraction", () => {
  it('traite une tâche ping', async () => {
    const job = await queue.add('ping', { sentAt: new Date().toISOString() });
    const result = await job.waitUntilFinished(events, 5000);
    expect(result).toHaveProperty('receivedAt');
  });

  it('rejette une charge utile invalide', async () => {
    const job = await queue.add('ping', { sentAt: 'pas une date' }, { attempts: 1 });
    await expect(job.waitUntilFinished(events, 5000)).rejects.toThrow();
  });

  it('rejette une tâche inconnue', async () => {
    const job = await queue.add('inconnue', {}, { attempts: 1 });
    await expect(job.waitUntilFinished(events, 5000)).rejects.toThrow(/Tâche inconnue/);
  });
});

describe('extraction d’un rapport', () => {
  it('lit le PDF dans le stockage et range le résultat avec sa traçabilité', async () => {
    const { data, keys } = await depositPdf('%PDF-1.7 rapport');
    const job = await queue.add('extract-report', data);

    await expect(job.waitUntilFinished(events, 10_000)).resolves.toEqual({
      status: 'success',
      reserves: 1,
    });
    expect(fake.ocr).toHaveBeenCalledWith(Buffer.from('%PDF-1.7 rapport'));
    const outcome = await readOutcome(keys.extraction);
    expect(outcome).toMatchObject({ status: 'success', report, trace });
    expect(await storage.get(keys.ocr)).not.toBeNull();
  });

  it("réutilise l'OCR déjà rangé quand la tâche est relancée", async () => {
    const { data } = await depositPdf();
    await (await queue.add('extract-report', data)).waitUntilFinished(events, 10_000);
    await (await queue.add('extract-report', data)).waitUntilFinished(events, 10_000);

    expect(fake.ocr).toHaveBeenCalledTimes(1);
    expect(fake.extractFromOcr).toHaveBeenCalledTimes(2);
  });

  it('range la sortie brute quand elle reste invalide, sans nouvel essai', async () => {
    fake.extractFromOcr.mockRejectedValueOnce(
      new ExtractionError('Extraction invalide après 2 essai(s).', { ...trace, attempts: 2 }),
    );
    const { data, keys } = await depositPdf();
    const job = await queue.add('extract-report', data, { attempts: 3 });

    await expect(job.waitUntilFinished(events, 10_000)).rejects.toThrow(/Extraction invalide/);
    expect(fake.extractFromOcr).toHaveBeenCalledTimes(1);
    const outcome = await readOutcome(keys.extraction);
    expect(outcome).toMatchObject({ status: 'error', trace: { attempts: 2, rawOutput: '{}' } });
  });

  it('échoue sans nouvel essai si le PDF est introuvable', async () => {
    const data = { organisationId: crypto.randomUUID(), importId: crypto.randomUUID() };
    const job = await queue.add('extract-report', data, { attempts: 3 });

    await expect(job.waitUntilFinished(events, 10_000)).rejects.toThrow(/PDF introuvable/);
    expect(fake.ocr).not.toHaveBeenCalled();
  });

  it('échoue clairement sans fournisseur configuré', async () => {
    const { data } = await depositPdf();
    await expect(extractReport(data, { storage, provider: null, logger })).rejects.toThrow(
      /Aucun fournisseur/,
    );
  });
});
