import { extractionJobSchemas, type ExtractionJobName } from '@obsio/shared';
import type { Job } from 'bullmq';
import { extractReport, type ExtractReportDeps } from './extract-report.js';

function isKnownJob(name: string): name is ExtractionJobName {
  return Object.hasOwn(extractionJobSchemas, name);
}

/** Traite une tâche de la file d'extraction après validation de sa charge utile. */
export function createProcessor(deps: ExtractReportDeps) {
  const { logger } = deps;
  return async (job: Job) => {
    if (!isKnownJob(job.name)) throw new Error(`Tâche inconnue : ${job.name}`);

    switch (job.name) {
      case 'ping': {
        const data = extractionJobSchemas.ping.parse(job.data);
        logger.info({ jobId: job.id, sentAt: data.sentAt }, 'ping reçu');
        return { receivedAt: new Date().toISOString() };
      }
      case 'extract-report':
        return extractReport(extractionJobSchemas['extract-report'].parse(job.data), deps);
    }
  };
}
