import { Mistral } from '@mistralai/mistralai';
import type {
  ChatCompletionRequestMessage,
  OCRResponse,
} from '@mistralai/mistralai/models/components';
import { providerReportSchema, type ProviderReport } from '@obsio/shared';
import { z } from 'zod';
import { mergeDuplicateDocuments } from './normalize.js';
import { buildUserPrompt, PROMPT_VERSION, SYSTEM_PROMPT } from './prompt.js';
import {
  ExtractionError,
  type ExtractionProvider,
  type ExtractionTrace,
  type OcrDocument,
} from './provider.js';

export interface MistralProviderOptions {
  apiKey: string;
  /** Versions figées : un alias « latest » rendrait les résultats non reproductibles. */
  ocrModel: string;
  extractionModel: string;
  /** Nombre total d'essais d'extraction (le premier compris). */
  maxAttempts?: number;
}

const responseSchema = z.toJSONSchema(providerReportSchema, { target: 'draft-7' });

/** Remplace les renvois vers les tableaux (« [tbl-0.html](tbl-0.html) ») par leur contenu HTML. */
export function inlineTables(page: OCRResponse['pages'][number]): string {
  return (page.tables ?? []).reduce(
    (markdown, table) => markdown.replaceAll(`[${table.id}](${table.id})`, table.content),
    page.markdown,
  );
}

/** Messages de la requête d'extraction, partagés avec l'API batch de l'évaluation. */
export function extractionMessages(document: OcrDocument): ChatCompletionRequestMessage[] {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: buildUserPrompt(document) },
  ];
}

/** Corps de la requête d'extraction au format de l'API HTTP (lignes JSONL de l'API batch). */
export function extractionRequestBody(document: OcrDocument) {
  return {
    temperature: 0,
    messages: extractionMessages(document),
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'rapport', schema: responseSchema, strict: true },
    },
  };
}

export function newExtractionTrace(
  document: OcrDocument,
  extractionModel: string,
): ExtractionTrace {
  return {
    provider: 'mistral',
    ocrModel: document.model,
    extractionModel,
    promptVersion: PROMPT_VERSION,
    attempts: 0,
    rawOutput: '',
    usage: { ocrPages: document.pages.length, promptTokens: 0, completionTokens: 0 },
  };
}

/** Valide la sortie brute du modèle par le schéma Zod, puis fusionne les documents en double. */
export function parseExtraction(output: string): { report: ProviderReport } | { error: string } {
  let json: unknown;
  try {
    json = JSON.parse(output);
  } catch {
    return { error: "La réponse n'est pas un JSON valide." };
  }
  const parsed = providerReportSchema.safeParse(json);
  if (parsed.success) return { report: mergeDuplicateDocuments(parsed.data) };
  const issues = parsed.error.issues
    .slice(0, 20)
    .map((i) => `- ${i.path.join('.')} : ${i.message}`);
  return { error: `La réponse ne respecte pas le schéma :\n${issues.join('\n')}` };
}

/** Client avec nouvelle tentative et attente croissante sur limite de débit (429) et erreurs serveur. */
export function createMistralClient(apiKey: string): Mistral {
  return new Mistral({
    apiKey,
    retryConfig: {
      strategy: 'backoff',
      backoff: {
        initialInterval: 2_000,
        maxInterval: 60_000,
        exponent: 2,
        maxElapsedTime: 300_000,
      },
      retryConnectionErrors: true,
    },
  });
}

export function createMistralProvider(options: MistralProviderOptions): ExtractionProvider {
  const client = createMistralClient(options.apiKey);
  const maxAttempts = options.maxAttempts ?? 2;

  return {
    async ocr(pdf) {
      const response = await client.ocr.process({
        model: options.ocrModel,
        document: {
          type: 'document_url',
          documentUrl: `data:application/pdf;base64,${pdf.toString('base64')}`,
        },
        tableFormat: 'html',
        includeBlocks: true,
      });
      return {
        model: response.model,
        pages: response.pages.map((page) => ({
          number: page.index + 1,
          markdown: inlineTables(page),
        })),
        raw: response,
      };
    },

    async extractFromOcr(document: OcrDocument) {
      const messages = extractionMessages(document);
      const trace = newExtractionTrace(document, options.extractionModel);

      let lastError = '';
      while (trace.attempts < maxAttempts) {
        trace.attempts += 1;
        const response = await client.chat.complete({
          model: options.extractionModel,
          temperature: 0,
          messages,
          responseFormat: {
            type: 'json_schema',
            jsonSchema: { name: 'rapport', schemaDefinition: responseSchema, strict: true },
          },
        });
        trace.usage.promptTokens += response.usage?.promptTokens ?? 0;
        trace.usage.completionTokens += response.usage?.completionTokens ?? 0;
        const content = response.choices[0]?.message?.content;
        trace.rawOutput = typeof content === 'string' ? content : JSON.stringify(content ?? null);

        const result = parseExtraction(trace.rawOutput);
        if ('report' in result) return { report: result.report, trace };

        // Nouvelle tentative en donnant au modèle les erreurs de validation.
        lastError = result.error;
        messages.push(
          { role: 'assistant', content: trace.rawOutput },
          { role: 'user', content: `${lastError}\nCorrige et renvoie l'objet JSON complet.` },
        );
      }
      throw new ExtractionError(
        `Extraction invalide après ${trace.attempts} essai(s). ${lastError}`,
        trace,
      );
    },
  };
}
