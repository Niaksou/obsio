import {
  countReserves,
  reportImportKeys,
  type ExtractionOutcome,
  type ExtractReportJob,
} from '@obsio/shared';
import { UnrecoverableError } from 'bullmq';
import type { Logger } from 'pino';
import {
  ExtractionError,
  type ExtractionProvider,
  type OcrDocument,
} from './extraction/provider.js';
import type { ObjectStorage } from './storage.js';

export interface ExtractReportDeps {
  storage: ObjectStorage;
  /** Absent si aucune clé d'API n'est configurée : la tâche échoue alors sans nouvel essai. */
  provider: ExtractionProvider | null;
  logger: Logger;
}

/**
 * Lit le PDF d'un import, l'extrait et range le résultat (`extraction.json`) avec sa
 * traçabilité. L'enregistrement en base et la validation humaine arrivent en J3.
 */
export async function extractReport(data: ExtractReportJob, deps: ExtractReportDeps) {
  const { storage, provider, logger } = deps;
  if (!provider) throw new UnrecoverableError("Aucun fournisseur d'extraction configuré.");
  const keys = reportImportKeys(data.organisationId, data.importId);

  const pdf = await storage.get(keys.pdf);
  if (!pdf) throw new UnrecoverableError(`PDF introuvable : ${keys.pdf}`);

  const cachedOcr = await storage.get(keys.ocr);
  let ocr: OcrDocument;
  if (cachedOcr) {
    ocr = JSON.parse(cachedOcr.toString('utf-8')) as OcrDocument;
  } else {
    ocr = await provider.ocr(pdf);
    await storage.put(keys.ocr, JSON.stringify(ocr), 'application/json');
  }
  logger.info(
    { importId: data.importId, pages: ocr.pages.length, cachedOcr: !!cachedOcr },
    'OCR prêt',
  );

  let outcome: ExtractionOutcome;
  try {
    const { report, trace } = await provider.extractFromOcr(ocr);
    outcome = { status: 'success', finishedAt: new Date().toISOString(), report, trace };
  } catch (error) {
    // Les erreurs réseau ou de quota sont relancées par BullMQ ; une sortie invalide ne l'est pas.
    if (!(error instanceof ExtractionError)) throw error;
    outcome = {
      status: 'error',
      finishedAt: new Date().toISOString(),
      error: error.message,
      trace: error.trace,
    };
  }
  await storage.put(keys.extraction, JSON.stringify(outcome), 'application/json');

  if (outcome.status === 'error') throw new UnrecoverableError(outcome.error);
  return { status: outcome.status, reserves: countReserves(outcome.report) };
}
