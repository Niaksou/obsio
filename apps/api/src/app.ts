import cors from '@fastify/cors';
import Fastify from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type { Redis } from 'ioredis';
import type pg from 'pg';
import type { ApiConfig } from './config.js';
import { healthRoutes } from './routes/health.js';

export interface AppDependencies {
  config: ApiConfig;
  pool: pg.Pool;
  redis: Redis;
}

function loggerOptions(nodeEnv: ApiConfig['NODE_ENV']) {
  if (nodeEnv === 'test') return false;
  if (nodeEnv === 'development') {
    return { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss' } } };
  }
  return true;
}

export async function buildApp({ config, pool, redis }: AppDependencies) {
  const app = Fastify({
    logger: loggerOptions(config.NODE_ENV),
  }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(cors, { origin: config.WEB_URL, credentials: true });
  await app.register(healthRoutes, { pool, redis });

  return app;
}
