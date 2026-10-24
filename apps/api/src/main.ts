import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createDatabase } from './db/client.js';
import { createRedis } from './redis.js';

const config = loadConfig();
const { pool } = createDatabase(config.DATABASE_URL);
const redis = createRedis(config.REDIS_URL);
const app = await buildApp({ config, pool, redis });

async function shutdown(signal: string) {
  app.log.info(`${signal} reçu, arrêt en cours`);
  await app.close();
  await Promise.all([pool.end(), redis.quit()]);
  process.exit(0);
}
process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

await app.listen({ port: config.API_PORT, host: '0.0.0.0' });
