import {
  databaseEnvSchema,
  nodeEnvSchema,
  parseEnv,
  redisEnvSchema,
  s3EnvSchema,
  smtpEnvSchema,
} from '@obsio/shared';
import { z } from 'zod';

const apiEnvSchema = z.object({
  ...nodeEnvSchema.shape,
  ...databaseEnvSchema.shape,
  ...redisEnvSchema.shape,
  ...smtpEnvSchema.shape,
  ...s3EnvSchema.shape,
  API_PORT: z.coerce.number().int().positive().default(3000),
  API_URL: z.url(),
  WEB_URL: z.url(),
  BETTER_AUTH_SECRET: z.string().min(32, 'au moins 32 caractères'),
  // Expéditeur des invitations envoyées à l'ouverture d'un client (compte sans connexion possible).
  OPERATOR_EMAIL: z.email(),
  OPERATOR_NAME: z.string().min(1),
});

export type ApiConfig = z.infer<typeof apiEnvSchema>;

export function loadConfig(source: Record<string, string | undefined> = process.env): ApiConfig {
  return parseEnv(apiEnvSchema, source);
}
