import { describe, expect, it } from 'vitest';
import { databaseEnvSchema, EnvError, parseEnv, s3EnvSchema, smtpEnvSchema } from './env.js';

describe('parseEnv', () => {
  it('renvoie la configuration typée', () => {
    const env = parseEnv(smtpEnvSchema, {
      SMTP_HOST: 'localhost',
      SMTP_PORT: '1025',
      SMTP_USER: '',
      MAIL_FROM: 'test@example.org',
    });
    expect(env.SMTP_PORT).toBe(1025);
    expect(env.SMTP_USER).toBeUndefined();
  });

  it('convertit les booléens écrits en texte', () => {
    const env = parseEnv(s3EnvSchema, {
      S3_ENDPOINT: 'http://localhost:9000',
      S3_REGION: 'fr-par',
      S3_BUCKET: 'b',
      S3_ACCESS_KEY: 'a',
      S3_SECRET_KEY: 's',
      S3_FORCE_PATH_STYLE: 'true',
    });
    expect(env.S3_FORCE_PATH_STYLE).toBe(true);
  });

  it('nomme les variables manquantes ou invalides', () => {
    expect(() => parseEnv(databaseEnvSchema, { DATABASE_URL: 'pas une url' })).toThrow(EnvError);
    expect(() => parseEnv(databaseEnvSchema, {})).toThrow(/DATABASE_URL/);
  });
});
