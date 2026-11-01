import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
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
import type { ExtractionQueue } from './imports/queue.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { inspectionRoutes } from './routes/inspections.js';
import { healthRoutes } from './routes/health.js';
import { importRoutes } from './routes/imports.js';
import { interventionRoutes } from './routes/intervention.js';
import { invitationRoutes } from './routes/invitations.js';
import { meRoutes } from './routes/me.js';
import { premisesRoutes } from './routes/premises.js';
import { reserveRoutes } from './routes/reserves.js';
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
  queue: ExtractionQueue;
}

function loggerOptions(nodeEnv: ApiConfig['NODE_ENV']) {
  if (nodeEnv === 'test') return false;
  if (nodeEnv === 'development') {
    return { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss' } } };
  }
  return true;
}

export async function buildApp({
  config,
  pool,
  db,
  redis,
  emailSender,
  storage,
  queue,
}: AppDependencies) {
  const app = Fastify({
    logger: loggerOptions(config.NODE_ENV),
    trustProxy: config.TRUST_PROXY,
  }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.decorateRequest('user', null);
  app.decorateRequest('organisation', null);

  await app.register(cors, {
    origin: config.WEB_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    // Nom du fichier du dossier de preuves, lu par le front.
    exposedHeaders: ['Content-Disposition'],
  });

  // Limitation de débit partagée entre les instances (Redis) ; les liens intervenant ont la leur.
  await app.register(rateLimit, {
    max: config.NODE_ENV === 'test' ? 10_000 : 600,
    timeWindow: '1 minute',
    redis,
    nameSpace: 'obsio-rate-limit:',
    skipOnError: true,
  });

  const auth = createAuth({ config, db, emailSender });
  const guards = createGuards(auth, db);

  await app.register(healthRoutes, { pool, redis });
  await app.register(authRoutes, { auth, apiUrl: config.API_URL });
  await app.register(meRoutes, { db, guards });
  await app.register(invitationRoutes, { db, guards });
  await app.register(premisesRoutes, { db, guards, storage });
  await app.register(importRoutes, { db, guards, storage, queue });
  await app.register(reserveRoutes, { db, guards, storage, emailSender, config });
  await app.register(interventionRoutes, { db, storage, emailSender, config });
  await app.register(dashboardRoutes, { db, guards, storage });
  await app.register(inspectionRoutes, { db, guards });

  // Exposés pour les modules de routes ajoutés par la suite (et pour les tests).
  app.decorate('guards', guards);

  return app;
}
