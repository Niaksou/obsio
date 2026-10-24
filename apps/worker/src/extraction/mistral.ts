import { Mistral } from '@mistralai/mistralai';
import type {
  ChatCompletionRequestMessage,
  OCRResponse,
} from '@mistralai/mistralai/models/components';
import { providerReportSchema, type ProviderReport } from '@obsio/shared';
import { z } from 'zod';
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

function validate(output: string): { report: ProviderReport } | { error: string } {
  let json: unknown;
  try {
    json = JSON.parse(output);
  } catch {
    return { error: "La réponse n'est pas un JSON valide." };
  }
  const parsed = providerReportSchema.safeParse(json);
  if (parsed.success) return { report: parsed.data };
  const issues = parsed.error.issues
    .slice(0, 20)
    .map((i) => `- ${i.path.join('.')} : ${i.message}`);
  return { error: `La réponse ne respecte pas le schéma :\n${issues.join('\n')}` };
}

export function createMistralProvider(options: MistralProviderOptions): ExtractionProvider {
  // Nouvelle tentative avec attente croissante sur limite de débit (429) et erreurs serveur.
  const client = new Mistral({
    apiKey: options.apiKey,
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
      const messages: ChatCompletionRequestMessage[] = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(document) },
      ];
      const trace: ExtractionTrace = {
        provider: 'mistral',
        ocrModel: document.model,
        extractionModel: options.extractionModel,
        promptVersion: PROMPT_VERSION,
        attempts: 0,
        rawOutput: '',
        usage: { ocrPages: document.pages.length, promptTokens: 0, completionTokens: 0 },
      };

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

        const result = validate(trace.rawOutput);
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
