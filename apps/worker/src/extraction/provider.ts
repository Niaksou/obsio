import type { ExtractionTrace, ProviderReport } from '@obsio/shared';

export type { ExtractionTrace };

/** Texte d'un rapport après OCR, page par page (pages numérotées à partir de 1). */
export interface OcrDocument {
  model: string;
  pages: { number: number; markdown: string }[];
  /** Réponse brute du service d'OCR, conservée pour la traçabilité. */
  raw: unknown;
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
