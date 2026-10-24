import { nodeEnvSchema, parseEnv, redisEnvSchema } from '@saas/shared';
import { z } from 'zod';

const workerEnvSchema = z.object({
  ...nodeEnvSchema.shape,
  ...redisEnvSchema.shape,
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(2),
});

export type WorkerConfig = z.infer<typeof workerEnvSchema>;

export function loadConfig(source: Record<string, string | undefined> = process.env): WorkerConfig {
  return parseEnv(workerEnvSchema, source);
}
