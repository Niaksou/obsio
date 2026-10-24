import { z } from 'zod';

/** File des imports de rapports, traitée par apps/worker. */
export const EXTRACTION_QUEUE = 'extraction';

// Tâche de diagnostic : vérifie que la chaîne API → Redis → worker fonctionne.
export const pingJobSchema = z.object({ sentAt: z.iso.datetime() });
export type PingJob = z.infer<typeof pingJobSchema>;

// Extraction d'un rapport déjà déposé dans le stockage (clés : reportImportKeys).
export const extractReportJobSchema = z.object({
  organisationId: z.uuid(),
  importId: z.uuid(),
});
export type ExtractReportJob = z.infer<typeof extractReportJobSchema>;

export const extractionJobSchemas = {
  ping: pingJobSchema,
  'extract-report': extractReportJobSchema,
} as const;

export type ExtractionJobName = keyof typeof extractionJobSchemas;
