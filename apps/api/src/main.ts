import { createClamavScanner, noScanner } from './antivirus.js';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createDatabase } from './db/client.js';
import { createSmtpSender } from './email/sender.js';
import { ingestImport } from './imports/ingest.js';
import { createExtractionQueue } from './imports/queue.js';
import { createFailFastRedis, createRedis } from './redis.js';
import { scheduleDailyNotifications } from './notifications.js';
import { createStorage } from './storage.js';

const config = loadConfig();
const { pool, db } = createDatabase(config.DATABASE_URL);
const redis = createRedis(config.REDIS_URL);
const limitsRedis = await createFailFastRedis(config.REDIS_URL);
const storage = createStorage(config);
if (config.NODE_ENV === 'development') await storage.ensureBucket(config.WEB_URL);
const queue = createExtractionQueue(redis);
const emailSender = createSmtpSender(config);
const scanner = config.CLAMAV_HOST
  ? createClamavScanner(config.CLAMAV_HOST, config.CLAMAV_PORT)
  : noScanner;
const app = await buildApp({
  config,
  pool,
  db,
  redis: limitsRedis,
  emailSender,
  storage,
  scanner,
  queue,
});
// Range le brouillon dès la fin de l'extraction (la consultation de l'import le fait aussi).
queue.watch(({ organisationId, importId }) => {
  ingestImport({ db, storage, queue }, organisationId, importId).catch((error: unknown) =>
    app.log.error({ err: error, importId }, "Rangement de l'extraction impossible"),
  );
});

const notifications = await scheduleDailyNotifications(redis, { db, emailSender, config }, app.log);

async function shutdown(signal: string) {
  app.log.info(`${signal} reçu, arrêt en cours`);
  await app.close();
  await Promise.all([queue.close(), notifications.close()]);
  await Promise.all([pool.end(), redis.quit(), limitsRedis.quit()]);
  storage.close();
  process.exit(0);
}
process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

await app.listen({ port: config.API_PORT, host: '0.0.0.0' });
