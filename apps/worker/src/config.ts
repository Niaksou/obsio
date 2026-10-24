import { nodeEnvSchema, parseEnv, redisEnvSchema } from '@obsio/shared';
import { z } from 'zod';

const workerEnvSchema = z.object({
  ...nodeEnvSchema.shape,
  ...redisEnvSchema.shape,
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(2),
  // Extraction : versions figées, à ne changer qu'après un passage du jeu de test.
  MISTRAL_API_KEY: z.string().min(1).optional(),
  MISTRAL_OCR_MODEL: z.string().min(1).default('mistral-ocr-4-1'),
  MISTRAL_EXTRACTION_MODEL: z.string().min(1).default('mistral-medium-2604'),
});

export type WorkerConfig = z.infer<typeof workerEnvSchema>;

export function loadConfig(source: Record<string, string | undefined> = process.env): WorkerConfig {
  return parseEnv(workerEnvSchema, source);
}
