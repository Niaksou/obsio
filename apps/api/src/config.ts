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
  // Derrière un proxy (Caddy, répartiteur de l'hébergeur) : l'adresse du client est lue dans
  // X-Forwarded-For, sinon la limitation de débit compterait tout le monde comme le proxy.
  // Compte principal du stockage, pour le service setup seulement : il crée le compte restreint
  // de l'application (S3_ACCESS_KEY). Absent en développement, où S3_ACCESS_KEY est le principal.
  S3_ADMIN_ACCESS_KEY: z.string().min(1).optional(),
  S3_ADMIN_SECRET_KEY: z.string().min(1).optional(),
  // Vérification des mots de passe divulgués (Have I Been Pwned) : active hors tests par défaut.
  PASSWORD_BREACH_CHECK: z.stringbool().optional(),
  TRUST_PROXY: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});

export type ApiConfig = z.infer<typeof apiEnvSchema>;

export function loadConfig(source: Record<string, string | undefined> = process.env): ApiConfig {
  return parseEnv(apiEnvSchema, source);
}
