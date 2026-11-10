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

/** Secrets acceptés sous la forme `NOM_FILE` (les autres variables `*_FILE` sont ignorées). */
export const FILE_VARIABLES = [
  'DATABASE_URL',
  'DATABASE_OWNER_URL',
  'REDIS_URL',
  'S3_ACCESS_KEY',
  'S3_SECRET_KEY',
  'S3_ADMIN_ACCESS_KEY',
  'S3_ADMIN_SECRET_KEY',
  'SMTP_PASSWORD',
  'BETTER_AUTH_SECRET',
  'MISTRAL_API_KEY',
  'VAPID_PRIVATE_KEY',
] as const;

/**
 * Variables lues dans un fichier (secrets Docker, ASVS 13.3.1) : `NOM_FILE=/run/secrets/nom`
 * vaut `NOM` avec le contenu du fichier, sans le saut de ligne final. Le secret n'apparaît ainsi
 * ni dans l'environnement déclaré du conteneur, ni dans `docker inspect`.
 */
export function resolveFileVariables(
  source: Record<string, string | undefined>,
  readFile: (path: string) => string,
): Record<string, string | undefined> {
  const resolved = { ...source };
  for (const name of FILE_VARIABLES) {
    const key = `${name}_FILE`;
    const path = source[key];
    if (!path) continue;
    if (source[name]) throw new EnvError(`${name} et ${key} sont tous deux définis`);
    resolved[name] = readFile(path).replace(/\r?\n$/, '');
    delete resolved[key];
  }
  return resolved;
}

/**
 * Valide les variables d'environnement et lève une erreur lisible si l'une est invalide. Avec
 * `readFile`, les variables `NOM_FILE` sont d'abord lues dans leur fichier.
 */
export function parseEnv<T extends z.ZodType>(
  schema: T,
  source: Record<string, string | undefined> = process.env,
  readFile?: (path: string) => string,
): z.infer<T> {
  const variables = readFile ? resolveFileVariables(source, readFile) : source;
  // Une variable vide dans .env vaut « non renseignée ».
  const cleaned = Object.fromEntries(Object.entries(variables).filter(([, value]) => value !== ''));
  const result = schema.safeParse(cleaned);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')} : ${issue.message}`)
      .join('\n');
    throw new EnvError(`Configuration invalide :\n${details}`);
  }
  return result.data;
}
