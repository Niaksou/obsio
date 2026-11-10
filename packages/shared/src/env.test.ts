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

describe('variables lues dans un fichier', () => {
  const files: Record<string, string> = {
    '/run/secrets/database_url': 'postgres://app_user:secret@postgres:5432/obsio\n',
  };
  const readFile = (path: string) => {
    if (!(path in files)) throw new Error(`absent : ${path}`);
    return files[path]!;
  };

  it('remplace NOM_FILE par le contenu du fichier, sans le saut de ligne final', () => {
    const env = parseEnv(
      databaseEnvSchema,
      { DATABASE_URL_FILE: '/run/secrets/database_url' },
      readFile,
    );
    expect(env.DATABASE_URL).toBe('postgres://app_user:secret@postgres:5432/obsio');
  });

  it('refuse une variable définie deux fois, et un fichier absent', () => {
    expect(() =>
      parseEnv(
        databaseEnvSchema,
        { DATABASE_URL: 'postgres://a@b/c', DATABASE_URL_FILE: '/run/secrets/database_url' },
        readFile,
      ),
    ).toThrow(EnvError);
    expect(() =>
      parseEnv(databaseEnvSchema, { DATABASE_URL_FILE: '/run/secrets/inconnu' }, readFile),
    ).toThrow('absent');
  });

  it('ignore les variables *_FILE qui ne sont pas des secrets connus', () => {
    const env = parseEnv(
      databaseEnvSchema,
      { DATABASE_URL: 'postgres://a@b/c', EDITEUR_RPC_FILE: '/fichier/inexistant' },
      readFile,
    );
    expect(env.DATABASE_URL).toBe('postgres://a@b/c');
  });
});
