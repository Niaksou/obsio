import type { ProviderReport } from '@obsio/shared';

/** Texte d'un rapport après OCR, page par page (pages numérotées à partir de 1). */
export interface OcrDocument {
  model: string;
  pages: { number: number; markdown: string }[];
  /** Réponse brute du service d'OCR, conservée pour la traçabilité. */
  raw: unknown;
}

/** Ce qu'il faut stocker avec chaque extraction (règle de traçabilité de la spec). */
export interface ExtractionTrace {
  provider: string;
  ocrModel: string;
  extractionModel: string;
  promptVersion: string;
  attempts: number;
  /** Dernière sortie brute du modèle, telle que reçue. */
  rawOutput: string;
  usage: { ocrPages: number; promptTokens: number; completionTokens: number };
}

export interface ExtractionResult {
  report: ProviderReport;
  trace: ExtractionTrace;
}

/** Fournisseur d'extraction : interchangeable (spec, « Pipeline d'extraction »). */
export interface ExtractionProvider {
  ocr(pdf: Buffer): Promise<OcrDocument>;
  extractFromOcr(document: OcrDocument): Promise<ExtractionResult>;
}

export async function extractReport(provider: ExtractionProvider, pdf: Buffer) {
  return provider.extractFromOcr(await provider.ocr(pdf));
}

/** La sortie du modèle n'a pas pu être validée après toutes les tentatives. */
export class ExtractionError extends Error {
  override name = 'ExtractionError';

  constructor(
    message: string,
    readonly trace: ExtractionTrace,
  ) {
    super(message);
  }
}
