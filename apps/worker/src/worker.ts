import { EXTRACTION_QUEUE } from '@obsio/shared';
import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import type { Logger } from 'pino';
import type { WorkerConfig } from './config.js';
import { createMistralProvider } from './extraction/mistral.js';
import type { ExtractionProvider } from './extraction/provider.js';
import { createProcessor } from './processor.js';
import { createS3Storage, type ObjectStorage } from './storage.js';

export interface WorkerOptions {
  prefix?: string;
  /** Remplacements pour les tests ; par défaut, S3 et Mistral selon la configuration. */
  storage?: ObjectStorage;
  provider?: ExtractionProvider | null;
}

function defaultProvider(config: WorkerConfig): ExtractionProvider | null {
  if (!config.MISTRAL_API_KEY) return null;
  return createMistralProvider({
    apiKey: config.MISTRAL_API_KEY,
    ocrModel: config.MISTRAL_OCR_MODEL,
    extractionModel: config.MISTRAL_EXTRACTION_MODEL,
  });
}

export function startWorker(config: WorkerConfig, logger: Logger, options: WorkerOptions = {}) {
  const { prefix, storage = createS3Storage(config) } = options;
  const provider = options.provider === undefined ? defaultProvider(config) : options.provider;
  if (!provider) logger.warn("MISTRAL_API_KEY absente : les tâches d'extraction échoueront");

  // maxRetriesPerRequest: null est exigé par BullMQ.
  const connection = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
  const worker = new Worker(EXTRACTION_QUEUE, createProcessor({ storage, provider, logger }), {
    connection,
    concurrency: config.WORKER_CONCURRENCY,
    prefix,
  });
  worker.on('failed', (job, error) => {
    logger.error({ jobId: job?.id, name: job?.name, err: error }, 'tâche en échec');
  });

  return {
    worker,
    async close() {
      await worker.close();
      await connection.quit();
    },
  };
}
