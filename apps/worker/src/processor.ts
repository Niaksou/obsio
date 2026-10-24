import { extractionJobSchemas, type ExtractionJobName } from '@saas/shared';
import type { Job } from 'bullmq';
import type { Logger } from 'pino';

function isKnownJob(name: string): name is ExtractionJobName {
  return Object.hasOwn(extractionJobSchemas, name);
}

/** Traite une tâche de la file d'extraction après validation de sa charge utile. */
export function createProcessor(logger: Logger) {
  return async (job: Job) => {
    if (!isKnownJob(job.name)) throw new Error(`Tâche inconnue : ${job.name}`);
    const data = extractionJobSchemas[job.name].parse(job.data);

    switch (job.name) {
      case 'ping':
        logger.info({ jobId: job.id, sentAt: data.sentAt }, 'ping reçu');
        return { receivedAt: new Date().toISOString() };
    }
  };
}
