import { readFileSync } from 'node:fs';
import {
  resolveFileVariables,
  databaseEnvSchema,
  nodeEnvSchema,
  parseEnv,
  redisEnvSchema,
  s3EnvSchema,
  smtpEnvSchema,
} from '@obsio/shared';
import { z } from 'zod';

const apiEnvSchema = z
  .object({
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
    // Compte principal du stockage, pour le service setup seulement : il crée le compte restreint
    // de l'application (S3_ACCESS_KEY). Absent en développement, où S3_ACCESS_KEY est le principal.
    S3_ADMIN_ACCESS_KEY: z.string().min(1).optional(),
    S3_ADMIN_SECRET_KEY: z.string().min(1).optional(),
    // Vérification des mots de passe divulgués (Have I Been Pwned) : active hors tests par défaut.
    PASSWORD_BREACH_CHECK: z.stringbool().optional(),
    // Antivirus (service clamd) : obligatoire en production, facultatif en développement. Par
    // une socket Unix partagée en déploiement (les fichiers ne passent pas par le réseau).
    CLAMAV_HOST: z.string().min(1).optional(),
    CLAMAV_PORT: z.coerce.number().int().positive().default(3310),
    CLAMAV_SOCKET: z.string().min(1).optional(),
    // Certificat et clé de l'API : HTTPS entre le proxy et l'API (ASVS 12.3.3).
    TLS_CERT_FILE: z.string().min(1).optional(),
    TLS_KEY_FILE: z.string().min(1).optional(),
    // Derrière un proxy (Caddy, répartiteur de l'hébergeur) : l'adresse du client est lue dans
    // X-Forwarded-For, sinon la limitation de débit compterait tout le monde comme le proxy.
    TRUST_PROXY: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
  })
  .refine((env) => env.NODE_ENV !== 'production' || env.CLAMAV_HOST || env.CLAMAV_SOCKET, {
    path: ['CLAMAV_HOST'],
    message:
      'CLAMAV_HOST ou CLAMAV_SOCKET obligatoire en production (antivirus des fichiers déposés)',
  })
  .refine((env) => !env.TLS_CERT_FILE === !env.TLS_KEY_FILE, {
    path: ['TLS_KEY_FILE'],
    message: 'TLS_CERT_FILE et TLS_KEY_FILE vont ensemble',
  });

export type ApiConfig = z.infer<typeof apiEnvSchema>;

export function loadConfig(source: Record<string, string | undefined> = process.env): ApiConfig {
  return parseEnv(apiEnvSchema, source, (path) => readFileSync(path, 'utf8'));
}

/**
 * Connexion du rôle propriétaire de la base (migrations, suppression d'une organisation), lue
 * dans DATABASE_OWNER_URL ou dans le fichier de DATABASE_OWNER_URL_FILE.
 */
export function ownerDatabaseUrl(source: Record<string, string | undefined> = process.env): string {
  const url = resolveFileVariables(source, (path) => readFileSync(path, 'utf8')).DATABASE_OWNER_URL;
  if (!url) throw new Error('DATABASE_OWNER_URL doit être défini');
  return url;
}
