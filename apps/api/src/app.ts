import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type { Redis } from 'ioredis';
import type { Writable } from 'node:stream';
import type pg from 'pg';
import { createAuth } from './auth/auth.js';
import { createGuards, type Guards } from './auth/guards.js';
import { authRoutes } from './auth/routes.js';
import type { ApiConfig } from './config.js';
import type { Database } from './db/client.js';
import type { EmailSender } from './email/sender.js';
import { handleError } from './errors.js';
import { logSerializers, loggerOptions } from './logging.js';
import { registerSecurityLog } from './security-log.js';
import type { ExtractionQueue } from './imports/queue.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { inspectionRoutes } from './routes/inspections.js';
import { healthRoutes } from './routes/health.js';
import type { FileScanner } from './antivirus.js';
import { importRoutes } from './routes/imports.js';
import { createQuotas } from './quotas.js';
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
  /** Limitation de débit, quotas, santé : connexion à échec rapide (`createFailFastRedis`). */
  redis: Redis;
  emailSender: EmailSender;
  storage: Storage;
  /** Antivirus des fichiers déposés (`noScanner` sans ClamAV, hors production). */
  scanner: FileScanner;
  queue: ExtractionQueue;
  /** Tests : journal écrit dans ce flux, quel que soit NODE_ENV. */
  logStream?: Writable;
  /** Certificat et clé : l'API répond en HTTPS (déploiement, ASVS 12.3.3), sinon en HTTP. */
  tls?: { cert: Buffer; key: Buffer };
}

export async function buildApp({
  config,
  pool,
  db,
  redis,
  emailSender,
  storage,
  scanner,
  queue,
  logStream,
  tls,
}: AppDependencies) {
  const app = Fastify({
    https: tls ?? null,
    logger: logStream
      ? { stream: logStream, serializers: logSerializers }
      : loggerOptions(config.NODE_ENV),
    trustProxy: config.TRUST_PROXY,
  }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.setErrorHandler(handleError);
  registerSecurityLog(app);
  // Réponses de l'API jamais conservées par le navigateur ni par un proxy (ASVS 14.3.2).
  app.addHook('onSend', async (_request, reply) => {
    if (!reply.hasHeader('cache-control')) reply.header('cache-control', 'no-store');
  });
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
    // Redis injoignable : la requête est refusée plutôt que de passer sans limite.
    skipOnError: false,
  });

  const quotas = createQuotas(redis);
  const auth = createAuth({ config, db, emailSender });
  const guards = createGuards(auth, db);

  await app.register(healthRoutes, { pool, redis });
  await app.register(authRoutes, { auth, apiUrl: config.API_URL });
  await app.register(meRoutes, { db, guards });
  await app.register(invitationRoutes, { db, guards });
  await app.register(premisesRoutes, { db, guards, storage, scanner });
  await app.register(importRoutes, { db, guards, storage, scanner, queue, quotas });
  await app.register(reserveRoutes, { db, guards, storage, scanner, emailSender, config });
  await app.register(interventionRoutes, { db, storage, scanner, emailSender, config });
  await app.register(dashboardRoutes, { db, guards, storage, quotas });
  await app.register(inspectionRoutes, { db, guards });

  // Exposés pour les modules de routes ajoutés par la suite (et pour les tests).
  app.decorate('guards', guards);

  return app;
}
