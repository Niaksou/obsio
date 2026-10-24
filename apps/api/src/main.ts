import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createDatabase } from './db/client.js';
import { createSmtpSender } from './email/sender.js';
import { createRedis } from './redis.js';
import { createStorage } from './storage.js';

const config = loadConfig();
const { pool, db } = createDatabase(config.DATABASE_URL);
const redis = createRedis(config.REDIS_URL);
const storage = createStorage(config);
if (config.NODE_ENV === 'development') await storage.ensureBucket(config.WEB_URL);
const app = await buildApp({
  config,
  pool,
  db,
  redis,
  emailSender: createSmtpSender(config),
  storage,
});

async function shutdown(signal: string) {
  app.log.info(`${signal} reçu, arrêt en cours`);
  await app.close();
  await Promise.all([pool.end(), redis.quit()]);
  storage.close();
  process.exit(0);
}
process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

await app.listen({ port: config.API_PORT, host: '0.0.0.0' });
