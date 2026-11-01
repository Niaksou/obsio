import { EXTRACTION_QUEUE, extractReportJobSchema, type ExtractReportJob } from '@obsio/shared';
import { Queue, QueueEvents } from 'bullmq';
import type { Redis } from 'ioredis';

/** Ce que l'API attend de la file d'extraction (remplaçable dans les tests). */
export interface ExtractionQueue {
  /** Une tâche par import : son identifiant sert d'identifiant de tâche. */
  enqueue(job: ExtractReportJob): Promise<void>;
  /** Échec définitif de la tâche, s'il y en a un (null si elle tourne encore ou a réussi). */
  failure(importId: string): Promise<string | null>;
  /** Appelle onFinished dès qu'une extraction se termine (réussie ou en échec définitif). */
  watch(onFinished: (job: ExtractReportJob) => void): void;
  close(): Promise<void>;
}

export function createExtractionQueue(connection: Redis): ExtractionQueue {
  const queue = new Queue(EXTRACTION_QUEUE, { connection });
  let events: QueueEvents | null = null;

  async function notify(jobId: string, onFinished: (job: ExtractReportJob) => void) {
    const job = await queue.getJob(jobId);
    const data = extractReportJobSchema.safeParse(job?.data);
    if (job?.name === 'extract-report' && data.success) onFinished(data.data);
  }

  return {
    async enqueue(job) {
      // Une tâche terminée garde son identifiant : on la retire avant de relancer l'import.
      await queue.remove(job.importId);
      await queue.add('extract-report', job, {
        jobId: job.importId,
        attempts: 3,
        backoff: { type: 'exponential', delay: 10_000 },
        removeOnComplete: { age: 7 * 24 * 3600 },
        removeOnFail: { age: 30 * 24 * 3600 },
      });
    },
    async failure(importId) {
      const job = await queue.getJob(importId);
      if (!job || (await job.getState()) !== 'failed') return null;
      return job.failedReason || "L'analyse a échoué.";
    },
    watch(onFinished) {
      events = new QueueEvents(EXTRACTION_QUEUE, { connection: connection.duplicate() });
      events.on('completed', ({ jobId }) => void notify(jobId, onFinished));
      // Un échec intermédiaire sera retenté : seul l'échec définitif est signalé par failure().
      events.on('failed', ({ jobId }) => void notify(jobId, onFinished));
    },
    async close() {
      await Promise.all([queue.close(), events?.close()]);
    },
  };
}
