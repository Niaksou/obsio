import { loadConfig } from '../config.js';
import { createStorage } from '../storage.js';

// Crée le bucket et autorise l'envoi direct depuis le front (WEB_URL), pour un stockage S3
// auto-hébergé (RustFS). Chez un hébergeur, le bucket et sa règle CORS se règlent dans sa console.
const config = loadConfig();
const storage = createStorage(config);
try {
  await storage.ensureBucket(config.WEB_URL);
  console.log(`Bucket ${config.S3_BUCKET} prêt, envois autorisés depuis ${config.WEB_URL}`);
} finally {
  storage.close();
}
