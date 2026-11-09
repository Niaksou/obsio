import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { describe, expect, it } from 'vitest';
import { provisionAppUser } from '../src/storage-admin.js';
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
