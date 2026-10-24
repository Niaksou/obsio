import { z } from 'zod';

// Morceaux de configuration, assemblés par chaque application selon ses besoins.

export const nodeEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export const databaseEnvSchema = z.object({
  DATABASE_URL: z.url(),
});

export const redisEnvSchema = z.object({
  REDIS_URL: z.url(),
});

export const s3EnvSchema = z.object({
  S3_ENDPOINT: z.url(),
  S3_REGION: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: z.stringbool().default(false),
});

export const smtpEnvSchema = z.object({
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().positive(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().min(1),
});

export class EnvError extends Error {
  override name = 'EnvError';
}

/** Valide les variables d'environnement et lève une erreur lisible si l'une est invalide. */
export function parseEnv<T extends z.ZodType>(
  schema: T,
  source: Record<string, string | undefined> = process.env,
): z.infer<T> {
  // Une variable vide dans .env vaut « non renseignée ».
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, value]) => value !== ''));
  const result = schema.safeParse(cleaned);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')} : ${issue.message}`)
      .join('\n');
    throw new EnvError(`Configuration invalide :\n${details}`);
  }
  return result.data;
}
