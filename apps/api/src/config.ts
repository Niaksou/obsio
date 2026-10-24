import {
  databaseEnvSchema,
  nodeEnvSchema,
  parseEnv,
  redisEnvSchema,
  smtpEnvSchema,
} from '@saas/shared';
import { z } from 'zod';

const apiEnvSchema = z.object({
  ...nodeEnvSchema.shape,
  ...databaseEnvSchema.shape,
  ...redisEnvSchema.shape,
  ...smtpEnvSchema.shape,
  API_PORT: z.coerce.number().int().positive().default(3000),
  API_URL: z.url(),
  WEB_URL: z.url(),
  BETTER_AUTH_SECRET: z.string().min(32, 'au moins 32 caractères'),
});

export type ApiConfig = z.infer<typeof apiEnvSchema>;

export function loadConfig(source: Record<string, string | undefined> = process.env): ApiConfig {
  return parseEnv(apiEnvSchema, source);
}
