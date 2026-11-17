import { CreateBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { describe, expect, it } from 'vitest';
import { provisionAppUser, provisionBackupUser } from '../src/storage-admin.js';
import { createStorage } from '../src/storage.js';
import { testConfig } from './helpers.js';

describe("compte de stockage de l'application", () => {
  it('n’a accès qu’aux objets de son bucket', async () => {
    // En local, S3_ACCESS_KEY est le compte principal de RustFS.
    const config = testConfig();
    const admin = {
      endpoint: config.S3_ENDPOINT,
      region: config.S3_REGION,
      accessKey: config.S3_ACCESS_KEY,
      secretKey: config.S3_SECRET_KEY,
    };
    const app = {
      accessKey: `obsio-essai-${crypto.randomUUID().slice(0, 8)}`,
      secretKey: crypto.randomUUID().replaceAll('-', ''),
      bucket: config.S3_BUCKET,
    };
    await createStorage(config).ensureBucket(config.WEB_URL);
    await provisionAppUser(admin, app);
    // Rejouer ne casse rien (setup tourne à chaque démarrage).
    await provisionAppUser(admin, app);

    const storage = createStorage({
      ...config,
      S3_ACCESS_KEY: app.accessKey,
      S3_SECRET_KEY: app.secretKey,
    });
    const key = `essais/${crypto.randomUUID()}.txt`;
    await storage.put(key, 'contenu', 'text/plain');
    expect((await storage.get(key))?.toString()).toBe('contenu');
    expect((await storage.list('essais/')).some((o) => o.key === key)).toBe(true);
    await storage.removeMany([key]);
    expect(await storage.get(key)).toBeNull();

    const client = new S3Client({
      endpoint: config.S3_ENDPOINT,
      region: config.S3_REGION,
      forcePathStyle: true,
      credentials: { accessKeyId: app.accessKey, secretAccessKey: app.secretKey },
    });
    await expect(
      client.send(new CreateBucketCommand({ Bucket: `intrus-${crypto.randomUUID().slice(0, 8)}` })),
    ).rejects.toThrow();
    client.destroy();
    storage.close();
  });

  it('le compte de la sauvegarde lit le bucket sans pouvoir y écrire ni effacer', async () => {
    const config = testConfig();
    const admin = {
      endpoint: config.S3_ENDPOINT,
      region: config.S3_REGION,
      accessKey: config.S3_ACCESS_KEY,
      secretKey: config.S3_SECRET_KEY,
    };
    const backup = {
      accessKey: `obsio-sauvegarde-${crypto.randomUUID().slice(0, 8)}`,
      secretKey: crypto.randomUUID().replaceAll('-', ''),
      bucket: config.S3_BUCKET,
    };
    const app = createStorage(config);
    await app.ensureBucket(config.WEB_URL);
    const key = `essais/${crypto.randomUUID()}.txt`;
    await app.put(key, 'à sauvegarder', 'text/plain');
    await provisionBackupUser(admin, backup);
    await provisionBackupUser(admin, backup);

    const reader = createStorage({
      ...config,
      S3_ACCESS_KEY: backup.accessKey,
      S3_SECRET_KEY: backup.secretKey,
    });
    expect((await reader.get(key))?.toString()).toBe('à sauvegarder');
    expect((await reader.list('essais/')).some((o) => o.key === key)).toBe(true);
    await expect(
      reader.put(`essais/${crypto.randomUUID()}.txt`, 'x', 'text/plain'),
    ).rejects.toThrow();
    await expect(reader.removeMany([key])).rejects.toThrow();
    expect((await app.get(key))?.toString()).toBe('à sauvegarder');

    const client = new S3Client({
      endpoint: config.S3_ENDPOINT,
      region: config.S3_REGION,
      forcePathStyle: true,
      credentials: { accessKeyId: backup.accessKey, secretAccessKey: backup.secretKey },
    });
    await expect(
      client.send(new PutObjectCommand({ Bucket: config.S3_BUCKET, Key: key, Body: 'écrasé' })),
    ).rejects.toThrow();
    client.destroy();
    await app.removeMany([key]);
    reader.close();
    app.close();
  });

  it('refuse de réutiliser la clé principale', async () => {
    const admin = {
      endpoint: 'http://localhost:1',
      region: 'r',
      accessKey: 'racine',
      secretKey: 's',
    };
    await expect(
      provisionAppUser(admin, { accessKey: 'racine', secretKey: 'x', bucket: 'b' }),
    ).rejects.toThrow('différer');
  });
});
