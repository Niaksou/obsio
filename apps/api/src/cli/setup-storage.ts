import { loadConfig } from '../config.js';
import { provisionAppUser } from '../storage-admin.js';
import { createStorage } from '../storage.js';

// Crée le bucket et autorise l'envoi direct depuis le front (WEB_URL), pour un stockage S3
// auto-hébergé (RustFS). Avec le compte principal (S3_ADMIN_*), crée aussi le compte restreint
// de l'application (S3_ACCESS_KEY). Chez un hébergeur, tout se règle dans sa console.
const config = loadConfig();
const admin =
  config.S3_ADMIN_ACCESS_KEY && config.S3_ADMIN_SECRET_KEY
    ? { accessKey: config.S3_ADMIN_ACCESS_KEY, secretKey: config.S3_ADMIN_SECRET_KEY }
    : null;
const storage = createStorage(
  admin ? { ...config, S3_ACCESS_KEY: admin.accessKey, S3_SECRET_KEY: admin.secretKey } : config,
);
try {
  await storage.ensureBucket(config.WEB_URL);
  console.log(`Bucket ${config.S3_BUCKET} prêt, envois autorisés depuis ${config.WEB_URL}`);
  if (admin) {
    await provisionAppUser(
      { endpoint: config.S3_ENDPOINT, region: config.S3_REGION, ...admin },
      {
        accessKey: config.S3_ACCESS_KEY,
        secretKey: config.S3_SECRET_KEY,
        bucket: config.S3_BUCKET,
      },
    );
    console.log(`Compte ${config.S3_ACCESS_KEY} limité au bucket ${config.S3_BUCKET}`);
  }
} finally {
  storage.close();
}
