import { EXTRACTION_QUEUE } from '@obsio/shared';
import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import type { Logger } from 'pino';
import type { WorkerConfig } from './config.js';
import { createProcessor } from './processor.js';

export function startWorker(
  config: WorkerConfig,
  logger: Logger,
  options: { prefix?: string } = {},
) {
  // maxRetriesPerRequest: null est exigé par BullMQ.
  const connection = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
  const worker = new Worker(EXTRACTION_QUEUE, createProcessor(logger), {
    connection,
    concurrency: config.WORKER_CONCURRENCY,
    ...options,
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
