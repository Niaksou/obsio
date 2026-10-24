import cors from '@fastify/cors';
import Fastify from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type { Redis } from 'ioredis';
import type pg from 'pg';
import { createAuth } from './auth/auth.js';
import { createGuards, type Guards } from './auth/guards.js';
import { authRoutes } from './auth/routes.js';
import type { ApiConfig } from './config.js';
import type { Database } from './db/client.js';
import type { EmailSender } from './email/sender.js';
import { healthRoutes } from './routes/health.js';
import { meRoutes } from './routes/me.js';
import { premisesRoutes } from './routes/premises.js';
import type { Storage } from './storage.js';

declare module 'fastify' {
  interface FastifyInstance {
    guards: Guards;
  }
}

export interface AppDependencies {
  config: ApiConfig;
  pool: pg.Pool;
  db: Database;
  redis: Redis;
  emailSender: EmailSender;
  storage: Storage;
}

function loggerOptions(nodeEnv: ApiConfig['NODE_ENV']) {
  if (nodeEnv === 'test') return false;
  if (nodeEnv === 'development') {
    return { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss' } } };
  }
  return true;
}

export async function buildApp({ config, pool, db, redis, emailSender, storage }: AppDependencies) {
  const app = Fastify({
    logger: loggerOptions(config.NODE_ENV),
  }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.decorateRequest('user', null);
  app.decorateRequest('organisation', null);

  await app.register(cors, {
    origin: config.WEB_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  const auth = createAuth({ config, db, emailSender });
  const guards = createGuards(auth, db);

  await app.register(healthRoutes, { pool, redis });
  await app.register(authRoutes, { auth, apiUrl: config.API_URL });
  await app.register(meRoutes, { db, guards });
  await app.register(premisesRoutes, { db, guards, storage });

  // Exposés pour les modules de routes ajoutés par la suite (et pour les tests).
  app.decorate('guards', guards);

  return app;
}
