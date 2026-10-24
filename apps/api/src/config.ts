import { databaseEnvSchema, nodeEnvSchema, parseEnv, redisEnvSchema } from '@saas/shared';
import { z } from 'zod';

const apiEnvSchema = z.object({
  ...nodeEnvSchema.shape,
  ...databaseEnvSchema.shape,
  ...redisEnvSchema.shape,
  API_PORT: z.coerce.number().int().positive().default(3000),
  API_URL: z.url(),
  WEB_URL: z.url(),
});

export type ApiConfig = z.infer<typeof apiEnvSchema>;

export function loadConfig(source: Record<string, string | undefined> = process.env): ApiConfig {
  return parseEnv(apiEnvSchema, source);
}
