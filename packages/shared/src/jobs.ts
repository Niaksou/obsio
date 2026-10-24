import { z } from 'zod';

/** File des imports de rapports, traitée par apps/worker. */
export const EXTRACTION_QUEUE = 'extraction';

// Tâche de diagnostic : vérifie que la chaîne API → Redis → worker fonctionne.
export const pingJobSchema = z.object({ sentAt: z.iso.datetime() });
export type PingJob = z.infer<typeof pingJobSchema>;

export const extractionJobSchemas = {
  ping: pingJobSchema,
} as const;

export type ExtractionJobName = keyof typeof extractionJobSchemas;
