import { readFileSync } from 'node:fs';
import { nodeEnvSchema, parseEnv, redisEnvSchema, s3EnvSchema } from '@obsio/shared';
import { z } from 'zod';

const workerEnvSchema = z.object({
  ...nodeEnvSchema.shape,
  ...redisEnvSchema.shape,
  ...s3EnvSchema.shape,
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(2),
  // « fixtures » rejoue le jeu de test (développement uniquement, refusé en production).
  EXTRACTION_PROVIDER: z.enum(['mistral', 'fixtures']).default('mistral'),
  FIXTURES_DIR: z.string().min(1).default('../../fixtures/reports'),
  // Extraction : versions figées, à ne changer qu'après un passage du jeu de test.
  MISTRAL_API_KEY: z.string().min(1).optional(),
  MISTRAL_OCR_MODEL: z.string().min(1).default('mistral-ocr-4-1'),
  MISTRAL_EXTRACTION_MODEL: z.string().min(1).default('mistral-medium-2604'),
});

export type WorkerConfig = z.infer<typeof workerEnvSchema>;

export function loadConfig(source: Record<string, string | undefined> = process.env): WorkerConfig {
  const config = parseEnv(workerEnvSchema, source, (path) => readFileSync(path, 'utf8'));
  if (config.EXTRACTION_PROVIDER === 'fixtures' && config.NODE_ENV === 'production') {
    throw new Error('EXTRACTION_PROVIDER=fixtures est réservé au développement');
  }
  return config;
}
