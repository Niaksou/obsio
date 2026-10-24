import { z } from 'zod';

// Contrat de sortie de l'extraction d'un rapport de vérification.
// Les noms reprennent ceux de la spec (section « Pipeline d'extraction »).

export const verificationTypeSchema = z.enum([
  'periodique', // Code du travail, vérification annuelle
  'initiale', // Code du travail, mise en service ou modification de structure
  'q18', // Référentiel APSAD D18, exigée par l'assureur
  'autre',
]);
export type VerificationType = z.infer<typeof verificationTypeSchema>;

const optionalText = z.string().trim().min(1).nullable();

export const extractedReserveSchema = z.object({
  /** Numéro de l'observation tel qu'imprimé dans le rapport (« 12 », « 3.2 »…). */
  reference: z.string().trim().min(1),
  /** Constat de non-conformité. */
  description: z.string().trim().min(1),
  /** Correction préconisée par l'organisme, quand elle est distincte du constat. */
  preconisation: optionalText,
  /** Texte ou norme cité (« R.4215-3 », « NF C 15-100 art. 411.3.3 »…). */
  articleReglementaire: optionalText,
  /** Emplacement tel qu'écrit dans le rapport (« TD2 atelier, départ 4 »). */
  localisationTexte: optionalText,
  /** Gravité ou priorité telle qu'écrite dans le rapport, s'il en indique une. */
  gravite: optionalText,
  /** null quand le rapport ne dit pas si l'observation était déjà signalée. */
  nouvelleOuReconduite: z.enum(['nouvelle', 'reconduite']).nullable(),
  /** Page du PDF (à partir de 1) où figure l'observation dans la liste récapitulative. */
  pageSource: z.int().positive(),
});
export type ExtractedReserve = z.infer<typeof extractedReserveSchema>;

export const extractedReportSchema = z.object({
  organisme: z.string().trim().min(1),
  numeroRapport: optionalText,
  typeVerification: verificationTypeSchema,
  /** Premier jour de la visite, au format AAAA-MM-JJ. */
  dateVisite: z.iso.date().nullable(),
  site: z.object({
    nom: z.string().trim().min(1),
    adresse: optionalText,
  }),
  reserves: z.array(extractedReserveSchema),
});
export type ExtractedReport = z.infer<typeof extractedReportSchema>;

/** Sortie d'un fournisseur d'extraction : chaque réserve porte en plus une confiance. */
export const providerReportSchema = extractedReportSchema.extend({
  reserves: z.array(extractedReserveSchema.extend({ confiance: z.number().min(0).max(1) })),
});
export type ProviderReport = z.infer<typeof providerReportSchema>;

/** Ce qu'il faut stocker avec chaque extraction (règle de traçabilité de la spec). */
export const extractionTraceSchema = z.object({
  provider: z.string(),
  ocrModel: z.string(),
  extractionModel: z.string(),
  promptVersion: z.string(),
  attempts: z.number().int().nonnegative(),
  /** Dernière sortie brute du modèle, telle que reçue. */
  rawOutput: z.string(),
  usage: z.object({
    ocrPages: z.number().int().nonnegative(),
    promptTokens: z.number().int().nonnegative(),
    completionTokens: z.number().int().nonnegative(),
  }),
});
export type ExtractionTrace = z.infer<typeof extractionTraceSchema>;

/** Résultat d'une extraction, rangé par le worker à côté du PDF (relu par l'API en J3). */
export const extractionOutcomeSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('success'),
    finishedAt: z.iso.datetime(),
    report: providerReportSchema,
    trace: extractionTraceSchema,
  }),
  z.object({
    status: z.literal('error'),
    finishedAt: z.iso.datetime(),
    error: z.string(),
    trace: extractionTraceSchema,
  }),
]);
export type ExtractionOutcome = z.infer<typeof extractionOutcomeSchema>;
