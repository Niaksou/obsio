import { pino } from 'pino';
import { loadConfig } from './config.js';
import { createS3Storage } from './storage.js';
import { startWorker } from './worker.js';

const config = loadConfig();
const logger = pino(
  config.NODE_ENV === 'development'
    ? { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss' } } }
    : {},
);
const storage = createS3Storage(config);
if (config.NODE_ENV === 'development') await storage.ensureBucket();
const { worker, close } = startWorker(config, logger, { storage });
await worker.waitUntilReady();
logger.info('Worker démarré');

async function shutdown(signal: string) {
  logger.info(`${signal} reçu, arrêt en cours`);
  await close();
  process.exit(0);
}
process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
