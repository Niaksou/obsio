import type { Mistral } from '@mistralai/mistralai';
import { MistralError } from '@mistralai/mistralai/models/errors';
import { z } from 'zod';

// API batch de Mistral : moitié prix, résultats en différé (quelques minutes en pratique).
// Réservée à l'évaluation ; l'import d'un rapport par un client reste synchrone.

export interface BatchOutput {
  /** Contenu du message de l'assistant, ou null si la requête a échoué. */
  content: string | null;
  error?: string;
  promptTokens: number;
  completionTokens: number;
}

const outputLineSchema = z.object({
  custom_id: z.string(),
  response: z
    .object({
      status_code: z.number(),
      body: z
        .object({
          choices: z.array(z.object({ message: z.object({ content: z.unknown() }) })).optional(),
          usage: z
            .object({ prompt_tokens: z.number(), completion_tokens: z.number() })
            .partial()
            .optional(),
        })
        .loose()
        .optional(),
    })
    .nullish(),
  error: z.unknown().optional(),
});

/** Lit le fichier de résultats (ou d'erreurs) d'un batch, une ligne JSON par requête. */
export function parseBatchOutput(jsonl: string): Map<string, BatchOutput> {
  const outputs = new Map<string, BatchOutput>();
  for (const line of jsonl.split('\n')) {
    if (!line.trim()) continue;
    const parsed = outputLineSchema.safeParse(JSON.parse(line));
    if (!parsed.success) continue;
    const { custom_id: id, response, error } = parsed.data;
    const usage = response?.body?.usage;
    const raw = response?.body?.choices?.[0]?.message.content;
    const ok = response?.status_code === 200 && raw != null;
    outputs.set(id, {
      content: ok ? (typeof raw === 'string' ? raw : JSON.stringify(raw)) : null,
      ...(ok
        ? {}
        : {
            error: `Requête en échec (${response?.status_code ?? 'sans réponse'}) : ${JSON.stringify(error ?? response?.body ?? null)}`,
          }),
      promptTokens: usage?.prompt_tokens ?? 0,
      completionTokens: usage?.completion_tokens ?? 0,
    });
  }
  return outputs;
}

const FINAL_STATUSES = new Set(['SUCCESS', 'FAILED', 'TIMEOUT_EXCEEDED', 'CANCELLED']);

async function download(client: Mistral, fileId: string): Promise<string> {
  return new Response(await client.files.download({ fileId })).text();
}

/**
 * Envoie les requêtes de chat en un seul batch et attend les résultats, indexés par identifiant.
 * Les requêtes absentes du résultat (batch expiré ou annulé) n'ont pas d'entrée.
 */
export async function runChatBatch(
  client: Mistral,
  model: string,
  requests: { id: string; body: Record<string, unknown> }[],
  { pollMs = 15_000, log = console.log }: { pollMs?: number; log?: (m: string) => void } = {},
): Promise<Map<string, BatchOutput>> {
  const jsonl = requests.map(({ id, body }) => JSON.stringify({ custom_id: id, body })).join('\n');
  const input = await client.files.upload({
    purpose: 'batch',
    file: { fileName: 'evaluation.jsonl', content: new TextEncoder().encode(jsonl) },
  });
  let job = await client.batch.jobs
    .create({
      inputFiles: [input.id],
      endpoint: '/v1/chat/completions',
      model,
      metadata: { usage: 'evaluation' },
      timeoutHours: 24,
    })
    .catch((error: unknown) => {
      if (error instanceof MistralError && error.statusCode === 402) {
        throw new Error(
          "L'API batch n'est pas ouverte sur ce compte Mistral (402) : vérifier la facturation dans la console, ou relancer sans --batch.",
        );
      }
      throw error;
    });
  log(`Batch ${job.id} : ${requests.length} requête(s) envoyée(s), en attente des résultats…`);

  let progress = '';
  while (!FINAL_STATUSES.has(job.status)) {
    await new Promise((resolve) => setTimeout(resolve, pollMs));
    job = await client.batch.jobs.get({ jobId: job.id });
    const now = `${job.status} ${job.completedRequests}/${job.totalRequests}`;
    if (now !== progress) log(`Batch ${job.id} : ${(progress = now)}`);
  }

  const outputs = new Map<string, BatchOutput>();
  for (const fileId of [job.errorFile, job.outputFile]) {
    if (!fileId) continue;
    for (const [id, output] of parseBatchOutput(await download(client, fileId))) {
      outputs.set(id, output);
    }
  }
  if (job.status !== 'SUCCESS') log(`Batch ${job.id} terminé en ${job.status}.`);
  return outputs;
}
