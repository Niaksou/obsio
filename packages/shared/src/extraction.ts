import { z } from 'zod';

// Contrat de sortie de l'extraction d'un rapport de vérification (Code du travail, Q18, Q19).
// Les noms reprennent ceux de la spec (section « Pipeline d'extraction »).

export const documentTypeSchema = z.enum([
  'periodique', // Code du travail, vérification annuelle
  'initiale', // Code du travail, mise en service ou modification de structure
  'q18', // Référentiel APSAD D18 (assureur) : compte rendu de vérification
  'q19', // Référentiel APSAD D19 (assureur) : thermographie infrarouge
  'autre',
]);
export type DocumentType = z.infer<typeof documentTypeSchema>;

const optionalText = z.string().trim().min(1).nullable();

export const extractedReserveSchema = z.object({
  /** Numéro de l'observation (ou de la fiche d'anomalie) tel qu'imprimé (« 12 », « 3.2 »…). */
  reference: z.string().trim().min(1),
  /** Code interne de l'organisme, repris d'un document à l'autre (« AG/260423/130043/1 »). */
  codeObservation: optionalText,
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
  /** Page du PDF (à partir de 1) où figure l'observation. */
  pageSource: z.int().positive(),
  /** Q18 : numéro (1 à 8) de la constatation standard à laquelle le point se rattache. */
  constatationQ18: z.int().min(1).max(8).nullable(),
  /** Q19 : températures relevées sur la fiche d'anomalie, en °C. */
  thermique: z
    .object({
      temperatureDefaut: z.number().nullable(),
      temperatureReference: z.number().nullable(),
      ecart: z.number().nullable(),
    })
    .nullable(),
});
export type ExtractedReserve = z.infer<typeof extractedReserveSchema>;

/** État d'une des 8 constatations standard du compte rendu Q18 (colonne cochée). */
export const q18ConstatationStateSchema = z.enum([
  'absence_danger',
  'danger_nouveau', // danger signalé pour la première fois
  'danger_deja_signale',
  'sans_objet',
  'non_verifie',
]);

export const q18SummarySchema = z.object({
  constatations: z
    .array(z.object({ numero: z.int().min(1).max(8), etat: q18ConstatationStateSchema }))
    .length(8),
  /** Case cochée : l'installation « peut » ou « ne peut pas » entraîner des risques d'incendie et d'explosion. */
  conclusion: z.enum(['risque', 'pas_de_risque']).nullable(),
});

/** Décompte imprimé sur le compte rendu Q19, pour vérifier qu'aucune fiche n'est oubliée. */
export const q19SummarySchema = z.object({
  anomaliesPriorite1: z.int().nonnegative().nullable(),
  anomaliesPriorite2: z.int().nonnegative().nullable(),
  anomaliesPriorite3: z.int().nonnegative().nullable(),
});

const documentFields = {
  type: documentTypeSchema,
  organisme: z.string().trim().min(1),
  numeroRapport: optionalText,
  /** Premier jour de la visite, au format AAAA-MM-JJ. */
  dateVisite: z.iso.date().nullable(),
  site: z.object({
    nom: z.string().trim().min(1),
    adresse: optionalText,
  }),
  /** Renseigné uniquement pour un document de type q18. */
  q18: q18SummarySchema.nullable(),
  /** Renseigné uniquement pour un document de type q19. */
  q19: q19SummarySchema.nullable(),
};

export const extractedDocumentSchema = z.object({
  ...documentFields,
  reserves: z.array(extractedReserveSchema),
});
export type ExtractedDocument = z.infer<typeof extractedDocumentSchema>;

/** Un PDF peut réunir plusieurs documents : rapport du Code du travail, Q18, Q19. */
export const extractedReportSchema = z.object({
  documents: z.array(extractedDocumentSchema).min(1),
});
export type ExtractedReport = z.infer<typeof extractedReportSchema>;

/** Sortie d'un fournisseur d'extraction : chaque réserve porte en plus une confiance. */
export const providerReportSchema = z.object({
  documents: z
    .array(
      z.object({
        ...documentFields,
        reserves: z.array(extractedReserveSchema.extend({ confiance: z.number().min(0).max(1) })),
      }),
    )
    .min(1),
});
export type ProviderReport = z.infer<typeof providerReportSchema>;

/** Nombre total de réserves, tous documents confondus. */
export function countReserves(report: { documents: { reserves: unknown[] }[] }): number {
  return report.documents.reduce((total, document) => total + document.reserves.length, 0);
}

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
